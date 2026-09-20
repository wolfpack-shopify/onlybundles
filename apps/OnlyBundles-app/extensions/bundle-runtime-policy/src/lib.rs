//! Authorize each selected line against the policy on its own Shopify product.
//! Cart attributes identify a selection; they never supply eligibility or pricing.

pub mod calculation;
pub mod pricing;
use pricing::PriceAdjustmentConfig;
pub mod published_policy;

use shopify_function::wasm_api::Value;
use std::collections::BTreeMap;

#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all = "camelCase")]
struct Policy {
    schema_version: i64,
    bundle_id: String,
    revision: String,
    parent_variant_id: String,
    #[shopify_function(default)]
    bundle_name: String,
    groups: Vec<Group>,
    membership_sets: BTreeMap<String, Vec<Membership>>,
    pricing: PriceAdjustmentConfig,
    #[shopify_function(default)]
    country_rule: String,
    subscription: Option<Subscription>,
}
#[derive(shopify_function::Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct Subscription {
    allowed_selling_plan_ids: Vec<String>,
    recurring: bool,
    discount_applies_on: String,
    one_time_purchase: bool,
}
#[derive(shopify_function::Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct Group {
    id: String,
    role: String,
    min_quantity: i64,
    max_quantity: i64,
    #[shopify_function(default)]
    required_products: Vec<RequiredProduct>,
    #[shopify_function(default)]
    conditions: Vec<MetricCondition>,
    #[shopify_function(default)]
    categories: Vec<Category>,
    #[shopify_function(default)]
    tiers: Vec<AddonTier>,
}
#[derive(shopify_function::Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct AddonTier {
    id: String,
    condition: MetricCondition,
    percentage: f64,
    max_quantity: i64,
    #[shopify_function(default)]
    conditions: Vec<MetricCondition>,
}
#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all = "camelCase")]
struct TierMembership { id: String, variant_selection: VariantSelection }
#[derive(shopify_function::Deserialize, PartialEq)]
struct Category {
    id: String,
    conditions: Vec<MetricCondition>,
}
#[derive(shopify_function::Deserialize, PartialEq)]
struct MetricCondition {
    #[shopify_function(rename = "type")]
    metric: String,
    operator: String,
    value: f64,
}
#[derive(shopify_function::Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct RequiredProduct {
    product_id: String,
    quantity: i64,
}
#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all = "camelCase")]
struct Membership {
    group_id: String,
    #[shopify_function(default)]
    categories: Vec<TierMembership>,
    #[shopify_function(default)]
    tiers: Vec<TierMembership>,
    variant_selection: VariantSelection,
    max_quantity: i64,
}
#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all = "camelCase")]
struct VariantSelection {
    mode: String,
    variant_ids: Option<Vec<String>>,
}
pub struct ValidatedPolicyGroup {
    pub bundle_id: String,
    pub bundle_name: String,
    pub parent_variant_id: String,
    pub price_adjustment: Option<PriceAdjustmentConfig>,
    pub is_scheduled: bool,
    pub is_subscription: bool,
    pub recurring: bool,
    pub discount_applies: bool,
    pub has_addons: bool,
    pub line_discounts: Vec<f64>,
    pub line_roles: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    bundle_id: String,
    revision: String,
    instance_id: String,
    group_id: String,
}
fn selection(line: &PolicyLine) -> Option<Selection> {
    let value = line.selection?;
    if value.len() > 512 {
        return None;
    }
    serde_json::from_str(value).ok()
}

pub fn validate_policy_group(
    lines: &[PolicyLine],
    revisions: Option<&Value>,
    country: &str,
) -> Option<ValidatedPolicyGroup> {
    let first = lines.first()?;
    let first_selection = selection(first)?;
    let bundle_id = first_selection.bundle_id.as_str();
    let revision = first_selection.revision.as_str();
    let instance = first_selection.instance_id.as_str();
    if instance.is_empty() {
        return None;
    }
    let mode = published_policy::pricing_mode(revisions, bundle_id, revision)?;
    let published = revisions?.get_obj_prop(bundle_id).get_obj_prop("policy");
    let policy: Policy = shopify_function::wasm_api::Deserialize::deserialize(&published).ok()?;
    if policy.schema_version != 2 || policy.bundle_id != bundle_id || policy.revision != revision
        || !country_is_eligible(&policy.country_rule, country) { return None; }
    let mut line_groups = Vec::<String>::new();
    let mut line_tiers = Vec::<Vec<String>>::new();
    // Function adapters bound bundle lines; a small vector avoids duplicated
    // tree machinery for each metric and keeps the WASM within Shopify's limit.
    let mut totals = Vec::<(String, i64, Option<f64>, Option<f64>)>::new();
    let mut category_totals = Vec::<(String, String, i64, Option<f64>, Option<f64>)>::new();
    let mut product_totals = BTreeMap::<(String, String), i64>::new();
    for line in lines {
        let selected = selection(line)?;
        if selected.bundle_id != bundle_id
            || selected.revision != revision
            || selected.instance_id != instance
            || line.selling_plan_id != first.selling_plan_id
        {
            return None;
        }
        let references: Vec<String> = shopify_function::wasm_api::Deserialize::deserialize(line.policy?).ok()?;
        let mut matching = references.iter().filter_map(|reference| policy.membership_sets.get(reference));
        let product_memberships = matching.next()?;
        if matching.next().is_some() { return None; }
        if line.has_selling_plan {
            let subscription = policy.subscription.as_ref()?;
            if !subscription.allowed_selling_plan_ids.iter().any(|plan| Some(plan.as_str()) == line.selling_plan_id) { return None; }
        } else if policy.subscription.as_ref().is_some_and(|subscription| !subscription.one_time_purchase) { return None; }
        let group_id = selected.group_id.as_str();
        let group = policy.groups.iter().find(|group| group.id == group_id)?;
        let role = match line.claimed_role {
            None => group.role.as_str(),
            Some("component") => "component",
            Some("default") => "default",
            Some("free_gift") => "free_gift",
            Some(value) if value == "addon" || value.starts_with("addon:") => "addon",
            _ => return None,
        };
        if role != group.role || group.min_quantity < 0 || group.max_quantity < group.min_quantity {
            return None;
        }
        let mut memberships = product_memberships.iter()
            .filter(|member| member.group_id == group_id);
        let membership = memberships.next()?;
        if memberships.next().is_some() {
            return None;
        }
        if !variant_matches(&membership.variant_selection, line.variant_id) { return None; }
        line_groups.push(group_id.to_string());
        line_tiers.push(membership.tiers.iter().filter(|tier| variant_matches(&tier.variant_selection, line.variant_id)).map(|tier| tier.id.clone()).collect());
        let quantity = line.quantity;
        if quantity <= 0 {
            return None;
        }
        let index = match totals.iter().position(|total| total.0 == group_id) {
            Some(index) => index,
            None => {
                totals.push((group_id.to_string(), 0, Some(0.0), Some(0.0)));
                totals.len() - 1
            }
        };
        let measured = &mut totals[index];
        measured.1 = measured.1.checked_add(quantity)?;
        measured.2 = add_metric(measured.2, line.unit_amount_shop_cents, quantity);
        measured.3 = add_metric(measured.3, line.unit_weight_grams, quantity);
        for category_membership in &membership.categories {
            if !variant_matches(&category_membership.variant_selection, line.variant_id) { continue; }
            let category = &category_membership.id;
            if !group.categories.iter().any(|entry| &entry.id == category) { return None; }
            let index = match category_totals.iter().position(|total| total.0 == group_id && &total.1 == category) {
                Some(index) => index,
                None => { category_totals.push((group_id.into(), category.clone(), 0, Some(0.0), Some(0.0))); category_totals.len() - 1 }
            };
            let measured = &mut category_totals[index];
            measured.2 = measured.2.checked_add(quantity)?;
            measured.3 = add_metric(measured.3, line.unit_amount_shop_cents, quantity);
            measured.4 = add_metric(measured.4, line.unit_weight_grams, quantity);
        }
        let product_quantity = product_totals
            .entry((line.product_id.to_string(), group_id.into()))
            .or_default();
        *product_quantity = product_quantity.checked_add(quantity)?;
        if *product_quantity > membership.max_quantity {
            return None;
        }
    }
    for group in &policy.groups {
        let measured = totals.iter().find(|total| total.0 == group.id);
        let quantity = measured.map(|total| total.1).unwrap_or(0);
        if (quantity < group.min_quantity && group.role != "addon") || quantity > group.max_quantity {
            return None;
        }
        if !conditions_match(&group.conditions, quantity,
            measured.map(|total| total.2).unwrap_or(Some(0.0)),
            measured.map(|total| total.3).unwrap_or(Some(0.0))) { return None; }
        for category in &group.categories {
            let total = category_totals.iter().find(|total| total.0 == group.id && total.1 == category.id);
            if !conditions_match(&category.conditions, total.map(|total| total.2).unwrap_or(0),
                total.map(|total| total.3).unwrap_or(Some(0.0)), total.map(|total| total.4).unwrap_or(Some(0.0))) { return None; }
        }
        for required in &group.required_products {
            if required.quantity <= 0
                || product_totals
                    .get(&(required.product_id.clone(), group.id.clone()))
                    .copied()
                    .unwrap_or(0)
                    < required.quantity
            {
                return None;
            }
        }
    }
    let discount_applies = policy.subscription.as_ref().map(|subscription| {
        subscription.discount_applies_on == "both" || subscription.discount_applies_on == if first.has_selling_plan { "subscription" } else { "one_time" }
    }).unwrap_or(true);
    let mut paid_total = 0.0;
    let mut paid_quantity: i64 = 0;
    let mut unit_prices = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let group = policy.groups.iter().find(|group| group.id == line_groups[index])?;
        if group.role == "component" || group.role == "default" {
            let unit_price = line.unit_amount_shop_cents? / 100.0;
            paid_total += unit_price * line.quantity as f64;
            paid_quantity = paid_quantity.checked_add(line.quantity)?;
            if paid_quantity > 10_000 { return None; }
            unit_prices.extend(std::iter::repeat_n(unit_price, line.quantity as usize));
        }
    }
    if paid_quantity == 0 { return None; }
    let base_percentage = if !discount_applies { 0.0 }
        else if policy.pricing.method == pricing::PricingMethod::BuyXGetY {
            calculation::calculate_buy_x_get_y_discount_percentage(&policy.pricing, &unit_prices, paid_total, paid_total, paid_quantity, 1.0)
        } else { calculation::calculate_discount_percentage(&policy.pricing, paid_total, paid_total, paid_quantity, paid_quantity, 1.0) };
    let mut line_discounts = Vec::new();
    for (index, _) in lines.iter().enumerate() {
        let group = policy.groups.iter().find(|group| group.id == line_groups[index])?;
        let mut percentage = match group.role.as_str() {
            "component" | "default" => base_percentage, "free_gift" => 100.0, "addon" => 0.0, _ => return None,
        };
        if !group.tiers.is_empty() {
            let tier = group.tiers.iter().enumerate().filter(|(_, tier)| conditions_match(std::slice::from_ref(&tier.condition), paid_quantity, Some(paid_total * 100.0), None))
                .max_by(|(left_index, left), (right_index, right)| left.condition.value.total_cmp(&right.condition.value).then(left_index.cmp(right_index)))?.1;
            if !line_tiers[index].contains(&tier.id) || !tier.percentage.is_finite() || !(0.0..=100.0).contains(&tier.percentage) { return None; }
            let measured = totals.iter().find(|total| total.0 == group.id)?;
            if measured.1 > tier.max_quantity || !conditions_match(&tier.conditions, measured.1, measured.2, measured.3) { return None; }
            percentage = tier.percentage;
        }
        line_discounts.push(percentage);
    }
    Some(ValidatedPolicyGroup {
        has_addons: policy.groups.iter().any(|group| group.role == "addon" || group.role == "free_gift"),
        line_discounts,
        line_roles: line_groups.iter().map(|group_id| {
            policy.groups.iter().find(|group| &group.id == group_id)
                .map(|group| group.role.clone()).unwrap_or_default()
        }).collect(),
        is_subscription: first.has_selling_plan,
        recurring: policy.subscription.as_ref().is_some_and(|subscription| subscription.recurring),
        discount_applies,
        bundle_name: policy.bundle_name,
        bundle_id: policy.bundle_id,
        parent_variant_id: policy.parent_variant_id,
        price_adjustment: Some(policy.pricing),
        is_scheduled: mode == published_policy::PricingMode::Scheduled,
    })
}

/// Shopify input adapters provide actual merchandise facts and app-owned policy data.
pub struct PolicyLine<'a> {
    pub product_id: &'a str,
    pub variant_id: &'a str,
    pub quantity: i64,
    pub unit_amount_shop_cents: Option<f64>,
    pub unit_weight_grams: Option<f64>,
    pub has_selling_plan: bool,
    pub selling_plan_id: Option<&'a str>,
    pub selection: Option<&'a str>,
    pub claimed_role: Option<&'a str>,
    pub policy: Option<&'a Value>,
}

pub struct TransformedPolicyLine<'a> {
    pub product_id: &'a str,
    pub variant_id: &'a str,
    pub quantity: i64,
    pub unit_amount_shop_cents: Option<f64>,
    pub unit_weight_grams: Option<f64>,
    pub selection: Option<&'a str>,
    pub policy: Option<&'a Value>,
    pub parent_policy: Option<&'a Value>,
}

#[derive(shopify_function::Deserialize)]
struct ParentPolicyCollection {
    policies: Vec<ParentPolicyEvidence>,
}

#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all = "camelCase")]
struct ParentPolicyEvidence {
    schema_version: i64,
    bundle_id: String,
    revision: String,
}

fn parent_safe_pricing(pricing: &PriceAdjustmentConfig) -> bool {
    pricing.method != pricing::PricingMethod::BuyXGetY
        && !pricing.conditions.as_ref().is_some_and(|condition| condition.condition_type == pricing::ConditionType::Quantity)
        && pricing.rules.as_ref().is_none_or(|rules| !rules.is_empty() && rules.iter().all(parent_safe_pricing))
}

/// Validates a Cart Transform parent plus separate add-on/gift lines. The
/// app-owned parent metafield proves the line is the dedicated parent; Shopify's
/// `requiresComponents` protection prevents that variant from being added
/// directly without a successful transform.
pub fn validate_transformed_policy_group(
    lines: &[TransformedPolicyLine],
    revisions: Option<&Value>,
    country: &str,
) -> Option<ValidatedPolicyGroup> {
    let parent_positions = lines.iter().enumerate().filter(|(_, line)| line.parent_policy.is_some()).collect::<Vec<_>>();
    let [(parent_position, parent)] = parent_positions.as_slice() else { return None; };
    let parent_selection = selection(&PolicyLine {
        product_id: parent.product_id, variant_id: parent.variant_id, quantity: parent.quantity,
        unit_amount_shop_cents: parent.unit_amount_shop_cents, unit_weight_grams: parent.unit_weight_grams,
        has_selling_plan: false, selling_plan_id: None, selection: parent.selection,
        claimed_role: None, policy: parent.policy,
    })?;
    let mode = published_policy::pricing_mode(revisions, &parent_selection.bundle_id, &parent_selection.revision)?;
    let published = revisions?.get_obj_prop(&parent_selection.bundle_id).get_obj_prop("policy");
    let policy: Policy = shopify_function::wasm_api::Deserialize::deserialize(&published).ok()?;
    if policy.schema_version != 2 || policy.bundle_id != parent_selection.bundle_id
        || policy.revision != parent_selection.revision || policy.parent_variant_id != parent.variant_id
        || !country_is_eligible(&policy.country_rule, country) || !parent_safe_pricing(&policy.pricing)
    { return None; }
    let evidence: ParentPolicyCollection = shopify_function::wasm_api::Deserialize::deserialize(parent.parent_policy?).ok()?;
    let matching = evidence.policies.iter().filter(|entry| entry.schema_version == 1
        && entry.bundle_id == policy.bundle_id && entry.revision == policy.revision).count();
    if matching != 1 || parent.quantity <= 0 { return None; }

    let paid_total = parent.unit_amount_shop_cents? * parent.quantity as f64 / 100.0;
    if !paid_total.is_finite() || paid_total < 0.0 { return None; }
    let base_percentage = calculation::calculate_discount_percentage(
        &policy.pricing, paid_total, paid_total, parent.quantity, parent.quantity, 1.0,
    );
    let mut line_discounts = vec![0.0; lines.len()];
    let mut line_roles = vec![String::new(); lines.len()];
    line_discounts[*parent_position] = base_percentage;
    line_roles[*parent_position] = "parent".into();

    for (index, line) in lines.iter().enumerate() {
        if index == *parent_position { continue; }
        let selected = selection(&PolicyLine {
            product_id: line.product_id, variant_id: line.variant_id, quantity: line.quantity,
            unit_amount_shop_cents: line.unit_amount_shop_cents, unit_weight_grams: line.unit_weight_grams,
            has_selling_plan: false, selling_plan_id: None, selection: line.selection,
            claimed_role: None, policy: line.policy,
        })?;
        if selected.bundle_id != policy.bundle_id || selected.revision != policy.revision
            || selected.instance_id != parent_selection.instance_id || line.quantity <= 0 { return None; }
        let group = policy.groups.iter().find(|group| group.id == selected.group_id
            && matches!(group.role.as_str(), "addon" | "free_gift"))?;
        let references: Vec<String> = shopify_function::wasm_api::Deserialize::deserialize(line.policy?).ok()?;
        let mut sets = references.iter().filter_map(|reference| policy.membership_sets.get(reference));
        let memberships = sets.next()?;
        if sets.next().is_some() { return None; }
        let mut matches = memberships.iter().filter(|membership| membership.group_id == group.id
            && variant_matches(&membership.variant_selection, line.variant_id));
        let membership = matches.next()?;
        if matches.next().is_some() || line.quantity > membership.max_quantity || line.quantity > group.max_quantity { return None; }
        let amount = line.unit_amount_shop_cents.map(|value| value * line.quantity as f64);
        let weight = line.unit_weight_grams.map(|value| value * line.quantity as f64);
        let percentage = if group.role == "free_gift" && group.tiers.is_empty() { 100.0 } else {
            let tier = group.tiers.iter().enumerate().filter(|(_, tier)| {
                tier.condition.metric == "amount"
                    && conditions_match(std::slice::from_ref(&tier.condition), parent.quantity, Some(paid_total * 100.0), None)
            }).max_by(|(left_index, left), (right_index, right)| {
                left.condition.value.total_cmp(&right.condition.value).then(left_index.cmp(right_index))
            })?.1;
            if !membership.tiers.iter().any(|entry| entry.id == tier.id && variant_matches(&entry.variant_selection, line.variant_id))
                || line.quantity > tier.max_quantity
                || !conditions_match(&tier.conditions, line.quantity, amount, weight)
            { return None; }
            tier.percentage
        };
        if !percentage.is_finite() || !(0.0..=100.0).contains(&percentage) { return None; }
        line_discounts[index] = percentage;
        line_roles[index] = group.role.clone();
    }

    Some(ValidatedPolicyGroup {
        bundle_id: policy.bundle_id, bundle_name: policy.bundle_name,
        parent_variant_id: policy.parent_variant_id, price_adjustment: Some(policy.pricing),
        is_scheduled: mode == published_policy::PricingMode::Scheduled,
        is_subscription: false, recurring: false, discount_applies: true,
        has_addons: policy.groups.iter().any(|group| matches!(group.role.as_str(), "addon" | "free_gift")),
        line_discounts, line_roles,
    })
}

fn add_metric(total: Option<f64>, unit: Option<f64>, quantity: i64) -> Option<f64> {
    let unit = unit?;
    if !unit.is_finite() || unit < 0.0 {
        return None;
    }
    let result = total? + unit * quantity as f64;
    result.is_finite().then_some(result)
}

fn country_is_eligible(rule: &str, country: &str) -> bool {
    if rule.is_empty() {
        return true;
    }
    let Some((mode, countries)) = rule.split_once(':') else {
        return false;
    };
    let matches = countries.split(',').any(|candidate| candidate == country);
    match mode {
        "include" => matches,
        "exclude" => !matches,
        _ => false,
    }
}

fn conditions_match(conditions: &[MetricCondition], quantity: i64, amount: Option<f64>, weight: Option<f64>) -> bool {
    conditions.iter().all(|condition| {
        let actual = match condition.metric.as_str() {
            "quantity" => Some(quantity as f64), "amount" => amount, "weight" => weight, _ => None,
        };
        let Some(actual) = actual else { return false; };
        if !condition.value.is_finite() || condition.value < 0.0 { return false; }
        match condition.operator.as_str() {
            "gte" => actual + 1e-7 >= condition.value,
            "lte" => actual - 1e-7 <= condition.value,
            "eq" => (actual - condition.value).abs() <= 1e-7,
            _ => false,
        }
    })
}

#[cfg(test)]
mod eligibility_tests;

/// Selection identifiers determine grouping only; validation resolves authority.
pub fn selection_group(value: &str) -> Option<(String, String)> {
    if value.len() > 512 { return None; }
    let selected: Selection = serde_json::from_str(value).ok()?;
    if selected.bundle_id.is_empty() || selected.instance_id.is_empty() { return None; }
    Some((selected.bundle_id, selected.instance_id))
}

fn variant_matches(selection: &VariantSelection, variant: &str) -> bool {
    match selection.mode.as_str() {
        "all_product_variants" => true,
        "listed_variants" => selection.variant_ids.as_ref().is_some_and(|ids| ids.iter().any(|id| id == variant)),
        _ => false,
    }
}
