#[derive(serde::Deserialize, shopify_function::Deserialize, Clone, Default, PartialEq)]
#[cfg_attr(debug_assertions, derive(Debug))]
#[serde(rename_all = "camelCase")]
#[shopify_function(rename_all = "camelCase")]
pub struct PriceAdjustmentConfig {
    #[serde(default)]
    #[shopify_function(default)]
    pub method: PricingMethod,
    #[serde(default)]
    #[shopify_function(default)]
    pub value: f64,
    #[serde(default)]
    #[shopify_function(default)]
    pub conditions: Option<Condition>,
    #[serde(default)]
    #[shopify_function(default)]
    pub customer_buys: Option<i64>,
    #[serde(default)]
    #[shopify_function(default)]
    pub customer_gets: Option<i64>,
    #[serde(default)]
    #[shopify_function(default)]
    pub discount_type: Option<String>,
    #[serde(default)]
    #[shopify_function(default)]
    pub apply_discount_to: Option<String>,
    #[serde(default)]
    #[shopify_function(default)]
    pub rules: Option<Vec<PriceAdjustmentConfig>>,
}

#[derive(serde::Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(debug_assertions, derive(Debug))]
#[serde(rename_all = "snake_case")]
pub enum PricingMethod {
    #[default]
    PercentageOff,
    FixedAmountOff,
    FixedBundlePrice,
    BuyXGetY,
}

/// Optional discount threshold condition.
#[derive(serde::Deserialize, shopify_function::Deserialize, Clone, PartialEq)]
#[cfg_attr(debug_assertions, derive(Debug))]
pub struct Condition {
    #[serde(rename = "type")]
    #[shopify_function(rename = "type")]
    pub condition_type: ConditionType,
    pub operator: String,
    pub value: f64,
}

#[derive(serde::Deserialize, Clone, PartialEq)]
#[cfg_attr(debug_assertions, derive(Debug))]
#[serde(rename_all = "snake_case")]
pub enum ConditionType {
    Quantity,
    Amount,
}

impl shopify_function::wasm_api::Deserialize for PricingMethod {
    fn deserialize(
        value: &shopify_function::wasm_api::Value,
    ) -> Result<Self, shopify_function::wasm_api::read::Error> {
        match value.as_string().as_deref() {
            Some("percentage_off") => Ok(Self::PercentageOff),
            Some("fixed_amount_off") => Ok(Self::FixedAmountOff),
            Some("fixed_bundle_price") => Ok(Self::FixedBundlePrice),
            Some("buy_x_get_y") => Ok(Self::BuyXGetY),
            _ => Err(shopify_function::wasm_api::read::Error::InvalidType),
        }
    }
}
impl shopify_function::wasm_api::Deserialize for ConditionType {
    fn deserialize(
        value: &shopify_function::wasm_api::Value,
    ) -> Result<Self, shopify_function::wasm_api::read::Error> {
        match value.as_string().as_deref() {
            Some("quantity") => Ok(Self::Quantity),
            Some("amount") => Ok(Self::Amount),
            _ => Err(shopify_function::wasm_api::read::Error::InvalidType),
        }
    }
}
