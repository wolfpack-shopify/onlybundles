use shopify_function::scalars::Decimal;
use crate::helpers::{decimal_to_f64, parse_json_or_default};
use crate::policy_validator::validate_policy_group;
use bundle_runtime_policy::{selection_group, calculation::rounded_percentage};
use crate::schema;
use crate::types::{CartLineDisplayProperties, CartLineMessagingSettings, ComponentParent, ConditionType, PricingMethod};

fn non_empty(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()).map(str::to_string)
}

pub fn process_merge_operations(
    input: &schema::run::Input,
    presentment_currency_rate: f64,
    processed_lines: &mut [bool],
    cart_line_messaging: &CartLineMessagingSettings,
) -> Vec<schema::CartOperation> {
    let mut operations = Vec::new();
    let mut bundle_name_counts: Vec<(String, u32)> = Vec::new();
    let lines = input.cart().lines();
    let mut groups: Vec<((String, String), Vec<usize>)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let Some(key) = line.selection().and_then(|attribute| attribute.value()).and_then(|value| selection_group(value)) else { continue; };
        if let Some((_, indices)) = groups.iter_mut().find(|(candidate, _)| candidate == &key) {
            indices.push(index);
        } else { groups.push((key, vec![index])); }
    }
    let revisions = input.shop().ppb_policy_revisions().map(|field| field.value());
    for ((_, instance_id), merge_line_indices) in &groups {
        if merge_line_indices.iter().any(|&index| lines[index].selling_plan_allocation().is_some()) { continue; }
        let Some(validated) = validate_policy_group(lines, merge_line_indices, revisions,
            input.localization().country().iso_code().as_str(), presentment_currency_rate) else { continue; };
        if validated.has_addons && !validated.is_scheduled { continue; }
        let base_positions: Vec<usize> = validated.line_roles.iter().enumerate()
            .filter_map(|(position, role)| matches!(role.as_str(), "component" | "default").then_some(position))
            .collect();
        if base_positions.is_empty() { continue; }
        let base_line_indices: Vec<usize> = base_positions.iter().map(|&position| merge_line_indices[position]).collect();
        let parent = ComponentParent { id: validated.parent_variant_id.clone(),
            price_adjustment: if !validated.is_scheduled && validated.discount_applies { validated.price_adjustment.clone() } else { None } };
        let offer_group_id = instance_id;
        let source_display_properties: CartLineDisplayProperties = parse_json_or_default(
            lines[base_line_indices[0]].bundle_display_properties().and_then(|attribute| attribute.value()).map(String::as_str));
        let parent_variant_id = parent.id.clone();
        let mut original_total = 0.0;
        let mut total_discount_amount = 0.0;
        for &position in &base_positions {
            let index = merge_line_indices[position];
            let line = &lines[index];
            let total = decimal_to_f64(line.cost().amount_per_quantity().amount()) * f64::from(*line.quantity());
            original_total += total;
            total_discount_amount += total * validated.line_discounts[position] / 100.0;
        }
        let discount_percentage = rounded_percentage(total_discount_amount, original_total);
        let bundle_total = (original_total * (1.0 - discount_percentage / 100.0) * 100.0).round() / 100.0;
        let currency = lines[base_line_indices[0]].cost().amount_per_quantity().currency_code();

        // -------------------------------------------------------------------------
        // Step 5: Build unique bundle title.
        // If no custom bundle name is provided, leave title as None so Shopify
        // natively uses the bundle parent product variant's title.
        // -------------------------------------------------------------------------
        let bundle_title = non_empty(&Some(validated.bundle_name.clone())).map(|base_name| {
            let count = if let Some((_, count)) = bundle_name_counts
                .iter_mut()
                .find(|(name, _)| name == &base_name)
            {
                *count += 1;
                *count
            } else {
                bundle_name_counts.push((base_name.clone(), 1));
                1
            };
            if count > 1 {
                format!("{} ({})", base_name, count)
            } else {
                base_name
            }
        });
        let bundle_name = bundle_title.clone().unwrap_or_else(|| "Bundle".to_string());

        // -------------------------------------------------------------------------
        // Step 6: Preserve the retail total used by checkout offer eligibility.
        // -------------------------------------------------------------------------
        let original_total_cents = (original_total * 100.0).round() as i64;

        // -------------------------------------------------------------------------
        // Step 7: Build MERGE operation using schema-generated types.
        // -------------------------------------------------------------------------
        let cart_lines: Vec<schema::CartLineInput> = base_line_indices
            .iter()
            .map(|&idx| {
                let line = &lines[idx];
                schema::CartLineInput {
                    cart_line_id: line.id().to_string(),
                    quantity: *line.quantity(),
                }
            })
            .collect();

        let mut attributes = vec![
            schema::AttributeOutput {
                key: "_is_bundle_parent".into(),
                value: "true".into(),
            },
            schema::AttributeOutput {
                key: "_bundle_name".into(),
                value: bundle_name.clone(),
            },
            schema::AttributeOutput {
                key: "_bundle_total_retail_cents".into(),
                value: original_total_cents.to_string(),
            },
            schema::AttributeOutput {
                key: "_wolfpackProductBundle:OfferId".into(),
                value: offer_group_id.clone(),
            },
        ];
        attributes.push(schema::AttributeOutput { key: "_bundle_total_quantity".into(),
            value: base_line_indices.iter().map(|&index| i64::from(*lines[index].quantity())).sum::<i64>().to_string() });
        attributes.push(schema::AttributeOutput { key: "_wpb_bundle_id".into(), value: validated.bundle_id.clone() });
        if let Some(selection) = lines[base_line_indices[0]].selection().and_then(|attribute| attribute.value()) {
            attributes.push(schema::AttributeOutput { key: "_wpb_selection".into(), value: selection.clone() });
        }
        if let Some(offer_analytics) = &source_display_properties.offer_analytics {
            if let Ok(value) = serde_json::to_string(offer_analytics) {
                attributes.push(schema::AttributeOutput {
                    key: "_wpb_offer_analytics".into(),
                    value,
                });
            }
        }

        if let Some(tier_progress) = &source_display_properties.tier_progress {
            attributes.push(schema::AttributeOutput {
                key: "_bundle_tier_progress".into(),
                value: tier_progress.get().to_string(),
            });
        } else if let Some(pa) = &parent.price_adjustment {
            if let Some(rules) = &pa.rules {
                if !rules.is_empty() {
                    #[derive(serde::Serialize)]
                    #[serde(rename_all = "camelCase")]
                    struct TierProgressRule<'a> {
                        condition_type: &'a str,
                        #[serde(skip_serializing_if = "Option::is_none")]
                        min_quantity: Option<i64>,
                        #[serde(skip_serializing_if = "Option::is_none")]
                        min_subtotal: Option<f64>,
                        discount_type: &'a str,
                        discount_value: f64,
                        #[serde(skip_serializing_if = "Option::is_none")]
                        customer_buys: Option<i64>,
                        #[serde(skip_serializing_if = "Option::is_none")]
                        customer_gets: Option<i64>,
                        #[serde(skip_serializing_if = "Option::is_none")]
                        bxy_discount_type: Option<&'a str>,
                    }

                    #[derive(serde::Serialize)]
                    struct TierProgressBarConfig {
                        enabled: bool,
                        #[serde(rename = "type")]
                        bar_type: &'static str,
                    }

                    #[derive(serde::Serialize)]
                    #[serde(rename_all = "camelCase")]
                    struct TierProgressMetadata<'a> {
                        rules: Vec<TierProgressRule<'a>>,
                        progress_bar: TierProgressBarConfig,
                    }

                    let normalized_rules: Vec<TierProgressRule> = rules
                        .iter()
                        .map(|r| {
                            let (cond_type, min_qty, min_subtotal) = match &r.conditions {
                                Some(c) if c.condition_type == ConditionType::Amount => {
                                    ("amount", None, Some(c.value))
                                }
                                Some(c) => ("quantity", Some(c.value as i64), None),
                                None => ("quantity", Some(0), None),
                            };
                            TierProgressRule {
                                condition_type: cond_type,
                                min_quantity: min_qty,
                                min_subtotal: min_subtotal,
                                discount_type: match r.method {
                                    PricingMethod::FixedAmountOff => "fixed_amount",
                                    PricingMethod::FixedBundlePrice => "fixed_bundle_price",
                                    PricingMethod::BuyXGetY => "buy_x_get_y",
                                    _ => "percentage",
                                },
                                discount_value: if matches!(r.method, PricingMethod::FixedAmountOff | PricingMethod::FixedBundlePrice)
                                    || (r.method == PricingMethod::BuyXGetY && r.discount_type.as_deref() == Some("fixed_amount")) {
                                    r.value * presentment_currency_rate
                                } else { r.value },
                                customer_buys: r.customer_buys,
                                customer_gets: r.customer_gets,
                                bxy_discount_type: r.discount_type.as_deref(),
                            }
                        })
                        .collect();
                    let metadata = TierProgressMetadata {
                        rules: normalized_rules,
                        progress_bar: TierProgressBarConfig {
                            enabled: true,
                            bar_type: "simple",
                        },
                    };
                    if let Ok(value) = serde_json::to_string(&metadata) {
                        attributes.push(schema::AttributeOutput {
                            key: "_bundle_tier_progress".into(),
                            value,
                        });
                    }
                }
            }
        }

        if cart_line_messaging.is_enabled && !validated.is_scheduled {
            if cart_line_messaging.show_original_price {
                attributes.push(schema::AttributeOutput { key: "Retail Price".into(), value: format_money(original_total, currency.as_str()) });
            }
            attributes.push(schema::AttributeOutput { key: "Bundle Price".into(), value: format_money(bundle_total, currency.as_str()) });
            if cart_line_messaging.discount_display.is_enabled
                && ((original_total - bundle_total) * 100.0).round() > 0.0
            {
                attributes.push(schema::AttributeOutput { key: "Bundle Savings".into(),
                    value: format!("{} ({:.2}%)", format_money(original_total - bundle_total, currency.as_str()), discount_percentage) });
            }
        }
        let price = (!validated.is_scheduled).then(|| schema::PriceAdjustment {
            percentage_decrease: Some(schema::PriceAdjustmentValue { value: Decimal::from(discount_percentage) }),
        });

        let merge_op = schema::LinesMergeOperation {
            cart_lines,
            parent_variant_id,
            title: bundle_title,
            price,
            attributes: Some(attributes),
            image: None,
        };

        operations.push(schema::CartOperation::LinesMerge(merge_op));

        for &idx in &base_line_indices {
            processed_lines[idx] = true;
        }
    }

    operations
}

fn format_money(amount: f64, currency: &str) -> String {
    let prefix = match currency {
        "USD" => "$", "EUR" => "€", "GBP" => "£", "INR" => "₹", "CAD" => "CA$", "AUD" => "A$", _ => "",
    };
    if prefix.is_empty() { format!("{currency} {amount:.2}") } else { format!("{prefix}{amount:.2}") }
}
