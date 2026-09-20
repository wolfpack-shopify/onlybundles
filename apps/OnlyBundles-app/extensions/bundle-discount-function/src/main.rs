use shopify_function::prelude::*;
mod candidates;
mod schedule;
pub mod cart_lines_discounts_generate_run;

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/cart_lines_discounts_generate_run.graphql", custom_scalar_overrides = {
        "Input.shop.ppbPolicyRevisions.value" => ::shopify_function::wasm_api::Value,
        "Input.cart.lines.merchandise.product.runtimePolicies.value" => ::shopify_function::wasm_api::Value,
        "Input.discount.configuration.value" => ::shopify_function::wasm_api::Value
    })]
    pub mod cart_lines_discounts_generate_run {}
}
fn main() { log!("Please invoke a named export."); std::process::abort(); }
