use bundle_cart_transform_rs::schema;
use serde_json::json;
mod common;
use common::{fixture, run};

fn total(input: serde_json::Value) -> f64 {
    let retail: f64 = input["cart"]["lines"].as_array().unwrap().iter().map(|line| line["quantity"].as_f64().unwrap() * line["cost"]["amountPerQuantity"]["amount"].as_str().unwrap().parse::<f64>().unwrap()).sum();
    let output = run(input);
    let schema::CartOperation::LinesMerge(merge) = &output.operations[0] else { panic!("merge"); };
    retail * (1.0 - merge.price.as_ref().unwrap().percentage_decrease.as_ref().unwrap().value.as_f64()/100.0)
}
#[test]
fn pricing_methods_use_shopify_component_prices() {
    for (method,value,expected) in [("percentage_off",20.0,48.0),("fixed_amount_off",1000.0,50.0),("fixed_bundle_price",3500.0,35.0)] {
        let mut input=fixture();
        for line in input["cart"]["lines"].as_array_mut().unwrap() {
            line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["pricing"]=json!({"method":method,"value":value});
        }
        assert!((total(input)-expected).abs()<0.01);
    }
}
#[test]
fn buy_x_get_y_mixed_prices_discounts_the_actual_lowest_unit() {
    let mut input=fixture(); input["cart"]["lines"][0]["cost"]["amountPerQuantity"]["amount"]=json!("30");
    input["cart"]["lines"][1]["cost"]["amountPerQuantity"]["amount"]=json!("10");
    assert!((total(input)-60.0).abs()<0.01);
}
#[test]
fn empty_and_ordinary_carts_are_unchanged() {
    let mut input=fixture(); input["cart"]["lines"]=json!([]); assert!(run(input).operations.is_empty());
    let mut input=fixture(); for line in input["cart"]["lines"].as_array_mut().unwrap() { line["selection"]=serde_json::Value::Null; }
    assert!(run(input).operations.is_empty());
}
#[test]
fn subscription_components_never_merge() {
    let mut input=fixture(); for line in input["cart"]["lines"].as_array_mut().unwrap() { line["sellingPlanAllocation"]=json!({"__typename":"SellingPlanAllocation"}); }
    assert!(run(input).operations.is_empty());
}
#[test]
fn cart_quantity_edits_are_revalidated() {
    let mut input=fixture(); input["cart"]["lines"][0]["quantity"]=json!(3); assert!(run(input).operations.is_empty());
}
#[test]
fn merchant_name_comes_from_published_configuration() {
    let mut input=fixture();
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["bundleName"]=json!("Merchant Bundle");
        line["bundleDisplayProperties"]=json!({"value":"{\"bundleName\":\"Buyer claim\"}"});
    }
    let output=run(input); let schema::CartOperation::LinesMerge(merge)=&output.operations[0] else {panic!("merge");};
    assert_eq!(merge.title.as_deref(),Some("Merchant Bundle"));
}

#[test]
fn merged_cart_properties_show_computed_price_and_savings_without_duplicate_items() {
    let mut input = fixture();
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["bundleDisplayProperties"] = json!({"value": json!({"box":"1", "items":"Redundant list", "retailPrice":"$1", "youSave":{"amountPercentage":"$999 (100%)"}}).to_string()});
    }
    let output = run(input);
    let schema::CartOperation::LinesMerge(merge) = &output.operations[0] else {panic!("merge");};
    let visible: Vec<_> = merge.attributes.as_ref().unwrap().iter().filter(|attribute| !attribute.key.starts_with('_')).map(|attribute| (attribute.key.as_str(), attribute.value.as_str())).collect();
    assert_eq!(visible, vec![("Retail Price", "$60.00"), ("Bundle Price", "$40.00"), ("Bundle Savings", "$20.00 (33.33%)")]);
}

#[test]
fn full_price_bundles_omit_the_savings_property() {
    let mut input = fixture();
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["pricing"] = json!({"method":"percentage_off","value":0});
    }
    let output = run(input);
    let schema::CartOperation::LinesMerge(merge) = &output.operations[0] else {panic!("merge");};
    let visible: Vec<_> = merge.attributes.as_ref().unwrap().iter().filter(|attribute| !attribute.key.starts_with('_')).map(|attribute| (attribute.key.as_str(), attribute.value.as_str())).collect();
    assert_eq!(visible, vec![("Retail Price", "$60.00"), ("Bundle Price", "$60.00")]);
}
