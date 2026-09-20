use crate::schema;
use bundle_runtime_policy::{selection_group, validate_policy_group, validate_transformed_policy_group, PolicyLine, TransformedPolicyLine};
use shopify_function::{scalars::Decimal, wasm_api::Value};

type Input = schema::cart_lines_discounts_generate_run::Input;
fn text(value: &Value, key: &str) -> String { value.get_obj_prop(key).as_string().unwrap_or_default() }

pub(crate) fn build_candidates(input: &Input) -> Vec<schema::ProductDiscountCandidate> {
    let Some(configuration) = input.discount().configuration().map(|field| field.value()) else { return vec![]; };
    let role = text(configuration,"role");
    let rate = input.presentment_currency_rate().as_f64();
    if !rate.is_finite() || rate <= 0.0 { return vec![]; }
    let lines = input.cart().lines();
    if lines.iter().filter(|line| line.selection().is_some()).take(11).count() > 10 { return vec![]; }
    let mut groups: Vec<((String,String),Vec<usize>)> = Vec::new();
    for (index,line) in lines.iter().enumerate() {
        let Some(key) = line.selection().and_then(|attribute| attribute.value()).and_then(|value| selection_group(value)) else { continue; };
        if let Some((_,indices)) = groups.iter_mut().find(|(candidate,_)| candidate == &key) { indices.push(index); }
        else { groups.push((key,vec![index])); }
    }
    let mut candidates = Vec::new();
    for (_,indices) in groups {
        let facts = indices.iter().map(|&index| {
            let line = &lines[index];
            let schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) = line.merchandise() else { return None; };
            Some(PolicyLine {
                product_id: variant.product().id(), variant_id: variant.id(),quantity:i64::from(*line.quantity()),
                unit_amount_shop_cents:Some(line.cost().amount_per_quantity().amount().as_f64()*100.0/rate),
                unit_weight_grams:variant.weight().map(|weight| weight * match variant.weight_unit() {
                    schema::WeightUnit::Grams=>1.0,schema::WeightUnit::Kilograms=>1000.0,
                    schema::WeightUnit::Ounces=>28.349523125,schema::WeightUnit::Pounds=>453.59237,_=>f64::NAN }),
                has_selling_plan:line.selling_plan_allocation().is_some(),
                selling_plan_id:line.selling_plan_allocation().map(|allocation| allocation.selling_plan().id().as_str()),
                selection:line.selection().and_then(|attribute|attribute.value()).map(String::as_str),claimed_role:None,
                policy:variant.product().runtime_policies().map(|field|field.value()),
            })
        }).collect::<Option<Vec<_>>>();
        let Some(facts) = facts else { continue; };
        let transformed = indices.iter().map(|&index| {
            let line = &lines[index];
            let schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) = line.merchandise() else { return None; };
            Some(TransformedPolicyLine {
                product_id:variant.product().id(),variant_id:variant.id(),quantity:i64::from(*line.quantity()),
                unit_amount_shop_cents:Some(line.cost().amount_per_quantity().amount().as_f64()*100.0/rate),
                unit_weight_grams:variant.weight().map(|weight| weight * match variant.weight_unit() {
                    schema::WeightUnit::Grams=>1.0,schema::WeightUnit::Kilograms=>1000.0,
                    schema::WeightUnit::Ounces=>28.349523125,schema::WeightUnit::Pounds=>453.59237,_=>f64::NAN }),
                selection:line.selection().and_then(|attribute|attribute.value()).map(String::as_str),
                policy:variant.product().runtime_policies().map(|field|field.value()),
                parent_policy:variant.parent_policy().map(|field|field.value()),
            })
        }).collect::<Option<Vec<_>>>();
        let Some(transformed) = transformed else { continue; };
        let revisions=input.shop().ppb_policy_revisions().map(|field|field.value());
        let country=input.localization().country().iso_code().as_str();
        let validated = if transformed.iter().any(|line| line.parent_policy.is_some()) {
            validate_transformed_policy_group(&transformed,revisions,country)
        } else {
            validate_policy_group(&facts,revisions,country)
        };
        let Some(validated) = validated else { continue; };
        let allowed = match role.as_str() {
            "addons" => !validated.is_scheduled && !validated.is_subscription && validated.has_addons,
            "subscription_initial" => !validated.is_scheduled && validated.is_subscription && !validated.recurring,
            "subscription_recurring" => !validated.is_scheduled && validated.is_subscription && validated.recurring,
            "scheduled_initial" | "scheduled_recurring" => validated.is_scheduled
                && text(configuration,"bundleId") == validated.bundle_id
                && text(configuration,"revision") == text_from_selection(&facts[0],"revision")
                && if role == "scheduled_recurring" { validated.is_subscription && validated.recurring } else { !validated.is_subscription || !validated.recurring }
                && scheduled_active(configuration,input),
            "checkout_integration" => !validated.is_scheduled && !validated.is_subscription && validated.has_addons
                && input.triggering_discount_code().is_some_and(|code| !code.is_empty() && code == &text(configuration,"code")),
            _ => false,
        };
        if !allowed { continue; }
        let mut cumulative_saving_cents: f64 = 0.0;
        let mut allocated_saving_cents: f64 = 0.0;
        for ((&index,percentage),line_role) in indices.iter().zip(validated.line_discounts).zip(validated.line_roles) {
            if role == "addons" && !matches!(line_role.as_str(), "addon" | "free_gift") { continue; }
            if role == "checkout_integration" && line_role == "parent" { continue; }
            if percentage <= 0.0 { continue; }
            let line = &lines[index];
            // Round the instance's cumulative saving, then allocate the remainder
            // to this line. Rounding each unit or split line independently changes
            // the permitted bundle total by cents.
            cumulative_saving_cents += line.cost().amount_per_quantity().amount().as_f64()
                * f64::from(*line.quantity()) * percentage;
            let rounded_saving_cents = cumulative_saving_cents.round();
            let amount = (rounded_saving_cents - allocated_saving_cents) / 100.0;
            allocated_saving_cents = rounded_saving_cents;
            if amount <= 0.0 { continue; }
            candidates.push(schema::ProductDiscountCandidate {
                associated_discount_code:None,message:(!validated.bundle_name.is_empty()).then(||validated.bundle_name.clone()),prerequisites:None,
                targets:vec![schema::ProductDiscountCandidateTarget::CartLine(schema::CartLineTarget { id:lines[index].id().clone(),quantity:None })],
                value:schema::ProductDiscountCandidateValue::FixedAmount(schema::ProductDiscountCandidateFixedAmount {
                    amount:Decimal::from(amount),applies_to_each_item:Some(false),
                }),
            });
        }
    }
    candidates
}
fn text_from_selection(line:&PolicyLine,key:&str)->String {
    line.selection.and_then(|value|serde_json::from_str::<serde_json::Value>(value).ok()).and_then(|value|value.get(key).and_then(|value|value.as_str()).map(str::to_string)).unwrap_or_default()
}
fn scheduled_active(configuration:&Value,input:&Input)->bool {
    match text(configuration,"scheduleMode").as_str() {
        "one_time"=>true, // Shopify native startsAt / endsAt own absolute scheduling.
        "recurring"=> *input.shop().local_time().after_start() && *input.shop().local_time().before_end()
            && crate::schedule::date_is_active(configuration,&input.shop().local_time().date().to_string()),
        _=>false,
    }
}
