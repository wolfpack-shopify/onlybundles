use bundle_cart_transform_rs::{cart_transform_run, schema};
use serde_json::{json, Value};
use shopify_function::run_function_with_input;

pub fn policy(variants: Value) -> Value {
    json!({"policies":[{
        "schemaVersion":1,"bundleId":"bundle","revision":"revision",
        "parentVariantId":"gid://shopify/ProductVariant/999",
        "groups":[{"id":"group","role":"component","minQuantity":3,"maxQuantity":3}],
        "memberships":[{"groupId":"group","variantSelection":variants,"maxQuantity":2}],
        "pricing":{"method":"buy_x_get_y","value":100,"customerBuys":2,"customerGets":1,
          "discountType":"percentage","applyDiscountTo":"lowest_priced"}
    }]})
}
pub fn fixture() -> Value {
    let lines: Vec<Value> = (1..=2).map(|id| json!({
        "id":format!("line-{id}"),"quantity":if id==1 {2} else {1},
        "selection":{"value":json!({"bundleId":"bundle","instanceId":"instance","groupId":"group","revision":"revision"}).to_string()},
        "stepType":null,"sellingPlanAllocation":null,
        "cost":{"amountPerQuantity":{"amount":"20.00","currencyCode":"USD"}},
        "merchandise":{"__typename":"ProductVariant","id":format!("gid://shopify/ProductVariant/{id}"),
          "component_reference":null,"price_adjustment":null,
          "product":{"id":format!("gid://shopify/Product/{id}"),"title":"Product",
            "runtimePolicies":{"value":policy(json!({"mode":"listed_variants","variantIds":[format!("gid://shopify/ProductVariant/{id}")]}))}}
        }
    })).collect();
    json!({"presentmentCurrencyRate":"1.0","localization":{"country":{"isoCode":"US"}},
      "shop":{"ppbPolicyRevisions":{"value":{"bundle":{"revision":"revision","pricingMode":"standard"}}}},
      "cartTransform":{"runtimeConfiguration":null},"cart":{"lines":lines}})
}
pub fn run(mut input: Value) -> schema::FunctionRunResult {
    publish_fixture(&mut input);
    run_function_with_input(cart_transform_run, &input.to_string()).unwrap()
}


// Compile the readable test policy specifications into the published wire format.
pub fn publish_fixture(input: &mut Value) {
    let mut shared = serde_json::Map::new();
    for (index, line) in input["cart"]["lines"].as_array_mut().unwrap().iter_mut().enumerate() {
        let field = &mut line["merchandise"]["product"]["runtimePolicies"];
        let Some(mut rules) = field["value"]["policies"][0].as_object().cloned() else { continue; };
        let bundle = rules["bundleId"].as_str().unwrap().to_string();
        let members = rules.remove("memberships").unwrap();
        rules.insert("schemaVersion".into(),json!(2));
        let entry = shared.entry(bundle).or_insert_with(|| { rules.insert("membershipSets".into(),json!({})); Value::Object(rules) });
        let reference = format!("membership-{index}");
        entry["membershipSets"][&reference] = members;
        field["value"] = json!([reference]);
    }
    for (bundle, rules) in shared {
        if let Some(record) = input["shop"]["ppbPolicyRevisions"]["value"][&bundle].as_object_mut() {
            record.insert("policy".into(),rules);
        }
    }
}
