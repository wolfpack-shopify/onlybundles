use shopify_function::prelude::*;

mod helpers;
mod merge;
mod policy_validator;
mod run;
mod types;

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/run.graphql", custom_scalar_overrides = {
        "Input.cart.lines.merchandise.product.runtimePolicies.value" => ::shopify_function::wasm_api::Value,
        "Input.shop.ppbPolicyRevisions.value" => ::shopify_function::wasm_api::Value,
        "Input.cartTransform.runtimeConfiguration.value" => ::shopify_function::wasm_api::Value
    })]
    pub mod run {}
}

// Re-export the inner function so integration tests can call run_function_with_input(cart_transform_run, json)
pub use run::cart_transform_run;
