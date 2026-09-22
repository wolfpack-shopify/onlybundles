use shopify_function::scalars::Decimal;

/// Convert a shopify_function Decimal scalar to f64.
///
/// Shopify's scalar owns conversion; invalid monetary inputs fail closed.
pub fn decimal_to_f64(d: &Decimal) -> f64 {
    let value = d.as_f64();
    if value.is_finite() {
        value
    } else {
        0.0
    }
}

/// Parse a JSON string into `T`, returning `T::default()` on any error.
pub fn parse_json_or_default<T>(json: Option<&str>) -> T
where
    T: serde::de::DeserializeOwned + Default,
{
    json.and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or_default()
}
