//! Adapt Cart Transform input to the shared policy validator.
use crate::schema;
use bundle_runtime_policy::PolicyLine;
pub use bundle_runtime_policy::ValidatedPolicyGroup;
use shopify_function::wasm_api::Value;

pub fn validate_policy_group(
    lines: &[schema::run::input::cart::Lines],
    indices: &[usize],
    revisions: Option<&Value>,
    country: &str,
    currency_rate: f64,
) -> Option<ValidatedPolicyGroup> {
    let facts = indices
        .iter()
        .map(|&index| {
            let line = lines.get(index)?;
            let schema::run::input::cart::lines::Merchandise::ProductVariant(variant) =
                line.merchandise()
            else {
                return None;
            };
            Some(PolicyLine {
                product_id: variant.product().id(),
                variant_id: variant.id(),
                quantity: i64::from(*line.quantity()),
                unit_amount_shop_cents: (currency_rate.is_finite() && currency_rate > 0.0).then(
                    || line.cost().amount_per_quantity().amount().as_f64() * 100.0 / currency_rate,
                ),
                unit_weight_grams: variant.weight().map(|weight| {
                    weight
                        * match variant.weight_unit() {
                            schema::WeightUnit::Grams => 1.0,
                            schema::WeightUnit::Kilograms => 1000.0,
                            schema::WeightUnit::Ounces => 28.349523125,
                            schema::WeightUnit::Pounds => 453.59237,
                            _ => f64::NAN,
                        }
                }),
                selling_plan_id: None,
                has_selling_plan: line.selling_plan_allocation().is_some(),
                selection: line.selection().and_then(|a| a.value()).map(String::as_str),
                claimed_role: line.step_type().and_then(|a| a.value()).map(String::as_str),
                policy: variant.product().runtime_policies().map(|m| m.value()),
            })
        })
        .collect::<Option<Vec<_>>>()?;
    bundle_runtime_policy::validate_policy_group(&facts, revisions, country)
}
