use bundle_cart_transform_rs::{cart_transform_run, schema};
use serde_json::{json, Value};
use shopify_function::run_function_with_input;
mod common;
use common::{fixture, policy, run};

fn set_metric_condition(input: &mut Value, metric: &str, threshold: f64) {
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]["groups"][0]
            ["conditions"] = json!([{"type":metric,"operator":"gte","value":threshold}]);
    }
}

#[test]
fn amount_rules_use_actual_cart_prices_and_presentment_conversion() {
    for (threshold, rate, eligible) in [
        (6000.0, 1.0, true),
        (6100.0, 1.0, false),
        (6000.0, 2.0, false),
        (3000.0, 2.0, true),
    ] {
        let mut input = fixture();
        set_metric_condition(&mut input, "amount", threshold);
        input["presentmentCurrencyRate"] = json!(rate.to_string());
        assert_eq!(!run(input).operations.is_empty(), eligible);
    }
}

#[test]
fn weight_rules_use_actual_variant_weight_in_grams() {
    for (threshold, eligible) in [(150.0, true), (151.0, false)] {
        let mut input = fixture();
        set_metric_condition(&mut input, "weight", threshold);
        input["cart"]["lines"][0]["merchandise"]["weight"] = json!(0.05);
        input["cart"]["lines"][0]["merchandise"]["weightUnit"] = json!("KILOGRAMS");
        input["cart"]["lines"][1]["merchandise"]["weight"] = json!(50);
        input["cart"]["lines"][1]["merchandise"]["weightUnit"] = json!("GRAMS");
        assert_eq!(!run(input).operations.is_empty(), eligible);
    }
    let mut input = fixture();
    set_metric_condition(&mut input, "weight", 150.0);
    assert!(run(input).operations.is_empty());
}
#[test]
fn buy_two_get_one_uses_actual_prices_without_tokens_or_cart_metafields() {
    let output = run(fixture());
    assert_eq!(output.operations.len(), 1);
    let schema::CartOperation::LinesMerge(merge) = &output.operations[0] else {
        panic!("expected merge")
    };
    assert_eq!(merge.parent_variant_id, "gid://shopify/ProductVariant/999");
    let percentage: f64 = merge
        .price
        .as_ref()
        .unwrap()
        .percentage_decrease
        .as_ref()
        .unwrap()
        .value
        .to_string()
        .parse()
        .unwrap();
    assert!((60.0 * (1.0 - percentage / 100.0) - 40.0).abs() < 0.01);
}
#[test]
fn every_product_must_supply_its_own_current_policy() {
    for replacement in [Value::Null, json!({"value":{"policies":[]}})] {
        let mut input = fixture();
        input["cart"]["lines"][1]["merchandise"]["product"]["runtimePolicies"] = replacement;
        assert!(run(input).operations.is_empty());
    }
}
#[test]
fn restrictive_variants_cannot_be_overridden_by_a_product_match() {
    let mut input = fixture();
    input["cart"]["lines"][1]["merchandise"]["id"] = json!("gid://shopify/ProductVariant/3");
    assert!(run(input).operations.is_empty());
}
#[test]
fn forged_selection_identifiers_and_roles_do_not_grant_benefits() {
    for field in ["bundleId", "instanceId", "groupId", "revision", "stepType"] {
        let mut input = fixture();
        if field == "stepType" {
            input["cart"]["lines"][1][field] = json!({"value":"free_gift"});
        } else {
            let mut selected: Value = serde_json::from_str(
                input["cart"]["lines"][1]["selection"]["value"]
                    .as_str()
                    .unwrap(),
            )
            .unwrap();
            selected[field] = json!("forged");
            input["cart"]["lines"][1]["selection"]["value"] = json!(selected.to_string());
        }
        assert!(run(input).operations.is_empty(), "{field}");
    }
}
#[test]
fn inactive_or_stale_registry_does_not_authorize() {
    for record in [
        json!(null),
        json!({"bundle":{"revision":"old","pricingMode":"standard"}}),
    ] {
        let mut input = fixture();
        input["shop"]["ppbPolicyRevisions"] = json!({"value":record});
        assert!(run(input).operations.is_empty());
    }
}
#[test]
fn split_lines_share_the_product_membership_limit() {
    let mut input = fixture();
    let mut split = input["cart"]["lines"][0].clone();
    split["id"] = json!("split");
    split["quantity"] = json!(1);
    input["cart"]["lines"][1] = split;
    assert!(run(input).operations.is_empty());
}

#[test]
fn variant_selection_modes_fail_closed_when_incomplete_or_unknown() {
    for variants in [
        json!({"mode":"listed_variants"}),
        json!({"mode":"listed_variants","variantIds":[]}),
        json!({"mode":"unknown"}),
        json!({}),
    ] {
        let mut input = fixture();
        input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"] =
            policy(variants);
        assert!(run(input).operations.is_empty());
    }
    let mut input = fixture();
    input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"] =
        policy(json!({"mode":"all_product_variants"}));
    assert_eq!(run(input).operations.len(), 1);
}

#[test]
fn scheduled_policies_keep_components_for_native_scheduled_discounts() {
    let mut input = fixture();
    input["shop"]["ppbPolicyRevisions"]["value"]["bundle"]["pricingMode"] = json!("scheduled");
    assert!(run(input).operations.is_empty());
}

#[test]
fn default_products_cannot_substitute_for_each_other() {
    let mut input = fixture();
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["stepType"] = json!({"value":"default"});
        let policy = &mut line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0];
        policy["groups"][0]["role"] = json!("default");
        policy["groups"][0]["requiredProducts"] = json!([
            {"productId":"gid://shopify/Product/1","quantity":2},
            {"productId":"gid://shopify/Product/2","quantity":1}
        ]);
        policy["memberships"][0]["maxQuantity"] = json!(3);
        policy["memberships"][0]["variantSelection"] = json!({"mode":"all_product_variants"});
    }
    assert_eq!(run(input.clone()).operations.len(), 1);
    input["cart"]["lines"][1]["merchandise"]["product"]["id"] = json!("gid://shopify/Product/1");
    input["cart"]["lines"][1]["merchandise"]["id"] = json!("gid://shopify/ProductVariant/1");
    assert!(run(input).operations.is_empty());
}

#[test]
fn direct_parent_add_requires_widget_component_selections() {
    let mut input = fixture();
    input["cart"]["lines"].as_array_mut().unwrap().truncate(1);
    let line = &mut input["cart"]["lines"][0];
    line["selection"] = Value::Null;
    line["wolfpackProductBundleOfferId"] = Value::Null;
    line["merchandise"]["id"] = json!("gid://shopify/ProductVariant/999");
    line["merchandise"]["component_reference"] =
        json!({"value":"[\"gid://shopify/ProductVariant/1\"]"});
    line["merchandise"]["price_adjustment"] = json!({"value":json!({
        "shop":"test.myshopify.com", "bundleId":"bundle", "revision":"revision",
        "countryRule":"", "componentQuantities":[2], "method":"percentage_off", "value":20
    }).to_string()});
    assert!(run(input).operations.is_empty());
}

#[test]
fn published_country_restrictions_apply_to_component_selections() {
    for (rule, country, expected) in [
        ("include:CA", "CA", 1),
        ("include:CA", "US", 0),
        ("exclude:US", "US", 0),
        ("exclude:US", "CA", 1),
    ] {
        let mut input = fixture();
        input["localization"]["country"]["isoCode"] = json!(country);
        for line in input["cart"]["lines"].as_array_mut().unwrap() {
            line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0]
                ["countryRule"] = json!(rule);
        }
        assert_eq!(run(input).operations.len(), expected);
    }
}

#[test]
fn category_rules_aggregate_only_authoritative_category_members() {
    for (minimum, variant, expected) in [(2, "1", true), (3, "1", false), (2, "999", false)] {
        let mut input = fixture();
        for (index, line) in input["cart"]["lines"].as_array_mut().unwrap().iter_mut().enumerate() {
            let policy = &mut line["merchandise"]["product"]["runtimePolicies"]["value"]["policies"][0];
            policy["groups"][0]["categories"] = json!([{"id":"nuts", "conditions":[{"type":"quantity","operator":"gte","value":minimum}]}]);
            policy["memberships"][0]["categories"] = if index == 0 { json!([{ "id": "nuts", "variantSelection": {"mode":"listed_variants", "variantIds":[format!("gid://shopify/ProductVariant/{variant}")]}}]) } else { json!([]) };
        }
        assert_eq!(!run(input).operations.is_empty(), expected);
    }
}

#[test]
fn selection_identifiers_are_sufficient_without_legacy_offer_properties() {
    let mut input = fixture();
    for line in input["cart"]["lines"].as_array_mut().unwrap() {
        line["wolfpackProductBundleOfferId"] = Value::Null;
    }
    assert_eq!(run(input).operations.len(), 1);
}

#[test]
fn separate_instances_are_validated_independently() {
    let mut input = fixture();
    let mut second = input["cart"]["lines"].as_array().unwrap().clone();
    for line in &mut second {
        line["id"] = json!(format!("second-{}", line["id"].as_str().unwrap()));
        line["selection"]["value"] = json!(json!({"bundleId":"bundle","revision":"revision","instanceId":"second","groupId":"group"}).to_string());
    }
    input["cart"]["lines"].as_array_mut().unwrap().extend(second);
    assert_eq!(run(input).operations.len(), 2);
}


#[test]
fn supported_bundle_line_limit_is_checked_before_policy_work() {
    let mut input=fixture();
    let line=input["cart"]["lines"][0].clone();
    input["cart"]["lines"]=json!(vec![line;11]);
    assert!(run_function_with_input(cart_transform_run,&input.to_string()).is_err());
}

#[test]
fn compact_memberships_require_current_shared_rules_and_product_evidence() {
    for missing in ["reference", "shared", "revision", "duplicate"] {
        let mut input=fixture(); common::publish_fixture(&mut input);
        match missing {
            "reference" => input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"]=json!(["not-published"]),
            "shared" => input["shop"]["ppbPolicyRevisions"]["value"]["bundle"]["policy"]=Value::Null,
            "revision" => input["shop"]["ppbPolicyRevisions"]["value"]["bundle"]["policy"]["revision"]=json!("stale"),
            _ => input["cart"]["lines"][0]["merchandise"]["product"]["runtimePolicies"]["value"]=json!(["membership-0","membership-0"]),
        }
        assert!(run_function_with_input(cart_transform_run,&input.to_string()).unwrap().operations.is_empty(),"{missing}");
    }
}
