use super::*;
use serde_json::{json, Value};
use shopify_function::run_function_with_input;

fn fixture(role: &str, scheduled: bool) -> Value {
    let policy = json!({"schemaVersion":1,"bundleId":"bundle","revision":"r","bundleName":"Bundle","parentVariantId":"gid://shopify/ProductVariant/99",
      "groups":[{"id":"g","role":"component","minQuantity":3,"maxQuantity":3}],
      "memberships":[{"groupId":"g","variantSelection":{"mode":"all_product_variants"},"maxQuantity":3}],
      "pricing":{"method":"buy_x_get_y","value":100,"customerBuys":2,"customerGets":1,"discountType":"percentage","applyDiscountTo":"lowest_priced"}});
    json!({"presentmentCurrencyRate":"1.0","localization":{"country":{"isoCode":"US"}},
      "shop":{"ppbPolicyRevisions":{"value":{"bundle":{"revision":"r","pricingMode":if scheduled {"scheduled"} else {"standard"}}}},
        "localTime":{"date":"2026-09-19","afterStart":true,"beforeEnd":true}},
      "cart":{"lines":[{"id":"line","quantity":3,"selection":{"value":json!({"bundleId":"bundle","revision":"r","instanceId":"i","groupId":"g"}).to_string()},
        "sellingPlanAllocation":null,"stepType":null,"cost":{"amountPerQuantity":{"amount":"20.0"}},
        "merchandise":{"__typename":"ProductVariant","id":"gid://shopify/ProductVariant/1","product":{"id":"gid://shopify/Product/1","runtimePolicies":{"value":{"policies":[policy]}}}}}]},
      "discount":{"discountClasses":["PRODUCT"],"configuration":{"value":{"role":role,"version":1,"bundleId":"bundle","revision":"r","scheduleMode":"one_time"}}},
      "triggeringDiscountCode":null,"enteredDiscountCodes":[]})
}
fn run(mut input: Value) -> schema::CartLinesDiscountsGenerateRunResult {
    publish_fixture(&mut input);
    run_function_with_input(cart_lines_discounts_generate_run,&input.to_string()).unwrap()
}
fn has_discount(input: Value) -> bool { !run(input).operations.is_empty() }
#[test]
fn native_scheduled_owner_prices_component_facts() {
    let output = run(fixture("scheduled_initial", true));
    assert_eq!(output.operations.len(),1);
    let schema::CartOperation::ProductDiscountsAdd(operation) = &output.operations[0] else { panic!("product discount"); };
    let schema::ProductDiscountCandidateValue::FixedAmount(discount) = &operation.candidates[0].value else { panic!("exact line discount required to avoid per-unit percentage rounding"); };
    assert_eq!(discount.amount.as_f64(),20.0);
    assert_eq!(discount.applies_to_each_item,Some(false));
}

#[test]
fn fixed_line_discount_uses_actual_presentment_prices() {
    let mut input=fixture("scheduled_initial",true);
    input["presentmentCurrencyRate"]=json!("1.35");
    input["cart"]["lines"][0]["cost"]["amountPerQuantity"]["amount"]=json!("27.0");
    let output=run(input);
    let schema::CartOperation::ProductDiscountsAdd(operation)=&output.operations[0] else {panic!("product discount");};
    let schema::ProductDiscountCandidateValue::FixedAmount(discount)=&operation.candidates[0].value else {panic!("fixed amount");};
    assert_eq!(discount.amount.as_f64(),27.0);
    assert_eq!(discount.applies_to_each_item,Some(false));
}

#[test]
fn split_component_lines_preserve_the_exact_bundle_saving() {
    for (pricing, expected_cents) in [
        (json!({"method":"buy_x_get_y","value":100,"customerBuys":2,"customerGets":1,"discountType":"percentage","applyDiscountTo":"lowest_priced"}), 2000),
        (json!({"method":"fixed_bundle_price","value":3500}), 2500),
    ] {
        let mut input=fixture("scheduled_initial",true);
        let mut line=input["cart"]["lines"][0].clone();
        line["quantity"]=json!(1);
        line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["pricing"]=pricing;
        input["cart"]["lines"]=json!((0..3).map(|index| {
            let mut split=line.clone();split["id"]=json!(format!("line-{index}"));split
        }).collect::<Vec<_>>());
        let output=run(input);
        let schema::CartOperation::ProductDiscountsAdd(operation)=&output.operations[0] else {panic!("product discount");};
        let amounts=operation.candidates.iter().map(|candidate| {
            let schema::ProductDiscountCandidateValue::FixedAmount(discount)=&candidate.value else {panic!("fixed amount");};
            assert_eq!(discount.applies_to_each_item,Some(false));
            (discount.amount.as_f64()*100.0).round() as i64
        }).collect::<Vec<_>>();
        assert_eq!(amounts.iter().sum::<i64>(),expected_cents);
        assert!(amounts.iter().max().unwrap()-amounts.iter().min().unwrap()<=1);
    }
}
#[test]
fn scheduled_owner_requires_matching_bundle_revision() {
    let mut input=fixture("scheduled_initial",true); input["discount"]["configuration"]["value"]["revision"]=json!("stale");
    assert!(!has_discount(input));
}
#[test]
fn ordinary_merged_bundles_do_not_receive_a_second_automatic_discount() { assert!(!has_discount(fixture("addons",false))); }
#[test]
fn published_subscription_plan_controls_initial_and_recurring_roles() {
    for (role,recurring,expected) in [("subscription_initial",false,true),("subscription_recurring",true,true),("subscription_initial",true,false),("subscription_recurring",false,false)] {
        let mut input=fixture(role,false);
        input["cart"]["lines"][0]["sellingPlanAllocation"]=json!({"sellingPlan":{"id":"gid://shopify/SellingPlan/1"}});
        input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["subscription"]=json!({"allowedSellingPlanIds":["gid://shopify/SellingPlan/1"],"recurring":recurring,"discountAppliesOn":"both","oneTimePurchase":true});
        assert_eq!(has_discount(input),expected);
    }
}
#[test]
fn forged_code_prefix_alone_grants_nothing() {
    let mut input=fixture("unknown",false); input["triggeringDiscountCode"]=json!("WPB-forged"); assert!(!has_discount(input));
}

#[test]
fn checkout_code_requires_exact_owner_code_and_valid_component_policy() {
    let mut input = fixture("checkout_integration", false);
    input["discount"]["configuration"]["value"]["code"] = json!("WPB-GOKWIK");
    input["triggeringDiscountCode"] = json!("WPB-GOKWIK");
    input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["groups"]
        .as_array_mut().unwrap().push(json!({"id":"optional-addon","role":"addon","minQuantity":0,"maxQuantity":1}));
    assert!(has_discount(input.clone()));
    let mut forged = input.clone();
    forged["triggeringDiscountCode"] = json!("WPB-FORGED");
    assert!(!has_discount(forged));
    let mut missing = input.clone();
    missing["triggeringDiscountCode"] = Value::Null;
    assert!(!has_discount(missing));
    input["shop"]["ppbPolicyRevisions"]["value"]["bundle"]["revision"] = json!("revoked");
    assert!(!has_discount(input));
}

// Compile the readable test policy specifications into the published wire format.
fn publish_fixture(input: &mut Value) {
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
