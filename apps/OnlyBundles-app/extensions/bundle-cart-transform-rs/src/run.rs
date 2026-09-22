use shopify_function::prelude::*;
use shopify_function::Result;

use crate::helpers::decimal_to_f64;
use crate::merge::process_merge_operations;
use crate::schema;
use crate::types::CartTransformRuntimeConfiguration;

/// Inner cart transform logic — called by the #[shopify_function] wrapper and
/// directly by integration tests via run_function_with_input(cart_transform_run, json).
pub fn cart_transform_run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    if input.cart().lines().is_empty() {
        return Ok(schema::FunctionRunResult { operations: vec![] });
    }

    // Whole-cart bound, before policy deserialization.
    let bundle_lines = input.cart().lines().iter().filter(|line| {
        line.selection().and_then(|a| a.value()).is_some()
    }).take(11).count();
    if bundle_lines > 10 { return Err("BUNDLE_CART_LINE_LIMIT_EXCEEDED".into()); }

    // presentmentCurrencyRate is Decimal! — convert to f64 once.
    // Returns 0.0 if non-finite or <= 0 so amount-based discount paths bail out cleanly.
    let rate = decimal_to_f64(input.presentment_currency_rate());
    let presentment_currency_rate = if rate.is_finite() && rate > 0.0 {
        rate
    } else {
        0.0
    };

    let mut processed_lines: Vec<bool> = input
        .cart()
        .lines()
        .iter()
        .map(|line| line.selling_plan_allocation().is_some())
        .collect();
    let runtime_configuration = CartTransformRuntimeConfiguration::from_value(
        input
            .cart_transform()
            .runtime_configuration()
            .map(|metafield| metafield.value()),
    );
    let operations = process_merge_operations(
        &input,
        presentment_currency_rate,
        &mut processed_lines,
        &runtime_configuration.bundle_cart_line_messaging,
    );

    Ok(schema::FunctionRunResult { operations })
}

/// WASM export — thin wrapper so #[shopify_function] can generate the export
/// while keeping cart_transform_run directly testable.
#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    cart_transform_run(input)
}
