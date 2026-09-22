use super::*;
use serde_json::json;

fn subscription_valid(plan: Option<&str>, enabled: bool, one_time: bool) -> bool {
    let selection = json!({"bundleId":"bundle","revision":"r","instanceId":"i","groupId":"g"}).to_string();
    let mut policy = json!({"schemaVersion":1,"bundleId":"bundle","revision":"r","parentVariantId":"gid://shopify/ProductVariant/99",
        "groups":[{"id":"g","role":"component","minQuantity":1,"maxQuantity":2}],
        "memberships":[{"groupId":"g","variantSelection":{"mode":"all_product_variants"},"maxQuantity":2}],
        "pricing":{"method":"percentage_off","value":10}});
    if enabled {
        policy["subscription"] = json!({"allowedSellingPlanIds":["gid://shopify/SellingPlan/1"],"recurring":true,"discountAppliesOn":"subscription","oneTimePurchase":one_time});
    }
    let context = shopify_function::wasm_api::Context::new_with_input(json!({
        "product":["member"],"registry":{"bundle":{"revision":"r","pricingMode":"standard","policy": shared(policy, "member")}}
    }));
    let root = context.input_get().unwrap();
    let product = root.get_obj_prop("product");
    let registry = root.get_obj_prop("registry");
    validate_policy_group(&[PolicyLine { product_id:"gid://shopify/Product/1",variant_id:"gid://shopify/ProductVariant/1",quantity:1,
        unit_amount_shop_cents:Some(2000.0),unit_weight_grams:None,has_selling_plan:plan.is_some(),selling_plan_id:plan,
        selection:Some(&selection),claimed_role:None,policy:Some(&product)}],Some(&registry),"US").is_some()
}

#[test]
fn subscriptions_require_the_actual_allocated_plan_and_one_time_permission() {
    assert!(subscription_valid(Some("gid://shopify/SellingPlan/1"),true,false));
    assert!(!subscription_valid(Some("gid://shopify/SellingPlan/2"),true,false));
    assert!(!subscription_valid(Some("gid://shopify/SellingPlan/1"),false,false));
    assert!(!subscription_valid(None,true,false));
    assert!(subscription_valid(None,true,true));
    assert!(subscription_valid(None,false,false));
}

#[test]
fn addons_use_published_tiers_and_actual_paid_components() {
    for (quantity, addon_quantity, expected) in [(1, 1, false), (2, 1, true), (2, 2, false)] {
        let mut policy = json!({"schemaVersion":1,"bundleId":"bundle","revision":"r","parentVariantId":"gid://shopify/ProductVariant/99",
            "groups":[{"id":"g","role":"component","minQuantity":1,"maxQuantity":4},
                {"id":"a","role":"addon","minQuantity":0,"maxQuantity":10,"tiers":[{"id":"t","condition":{"type":"quantity","operator":"gte","value":2},"percentage":25,"maxQuantity":1}]}],
            "memberships":[{"groupId":"g","variantSelection":{"mode":"all_product_variants"},"maxQuantity":4}],
            "pricing":{"method":"percentage_off","value":10}});
        let paid = policy.clone();
        policy["memberships"] = json!([{"groupId":"a","variantSelection":{"mode":"all_product_variants"},"maxQuantity":10,
            "tiers":[{"id":"t","variantSelection":{"mode":"listed_variants","variantIds":["gid://shopify/ProductVariant/2"]}}]}]);
        let mut rules=shared(paid,"paid");
        rules["membershipSets"]["addon"]=policy["memberships"].clone();
        let context = shopify_function::wasm_api::Context::new_with_input(json!({"paid":["paid"],"addon":["addon"],
            "registry":{"bundle":{"revision":"r","pricingMode":"standard","policy":rules}}}));
        let root = context.input_get().unwrap();
        let paid = root.get_obj_prop("paid"); let addon = root.get_obj_prop("addon"); let registry = root.get_obj_prop("registry");
        let main_selection = json!({"bundleId":"bundle","revision":"r","instanceId":"i","groupId":"g"}).to_string();
        let addon_selection = json!({"bundleId":"bundle","revision":"r","instanceId":"i","groupId":"a"}).to_string();
        let lines = [PolicyLine {product_id:"gid://shopify/Product/1",variant_id:"gid://shopify/ProductVariant/1",quantity,
            unit_amount_shop_cents:Some(2000.0),unit_weight_grams:None,has_selling_plan:false,selling_plan_id:None,selection:Some(&main_selection),claimed_role:None,policy:Some(&paid)},
            PolicyLine {product_id:"gid://shopify/Product/2",variant_id:"gid://shopify/ProductVariant/2",quantity:addon_quantity,
            unit_amount_shop_cents:Some(10000.0),unit_weight_grams:None,has_selling_plan:false,selling_plan_id:None,selection:Some(&addon_selection),claimed_role:Some("addon"),policy:Some(&addon)}];
        let result = validate_policy_group(&lines,Some(&registry),"US");
        assert_eq!(result.is_some(),expected);
        if let Some(validated) = result { assert!(validated.has_addons); assert_eq!(validated.line_discounts[1],25.0); }
    }
}

fn shared(mut policy: serde_json::Value, key: &str) -> serde_json::Value {
    let memberships=policy.as_object_mut().unwrap().remove("memberships").unwrap();
    policy["schemaVersion"]=json!(2);
    policy["membershipSets"]=json!({key:memberships});
    policy
}
