use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[shopify_function]
fn cart_lines_discounts_generate_run(input: schema::cart_lines_discounts_generate_run::Input) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let candidates = if input.discount().discount_classes().contains(&schema::DiscountClass::Product) {
        crate::candidates::build_candidates(&input)
    } else { vec![] };
    let operations = if candidates.is_empty() { vec![] } else {
        vec![schema::CartOperation::ProductDiscountsAdd(schema::ProductDiscountsAddOperation {
            selection_strategy:schema::ProductDiscountSelectionStrategy::All,candidates,
        })]
    };
    Ok(schema::CartLinesDiscountsGenerateRunResult { operations })
}

#[cfg(test)]
#[path = "runtime_policy_tests.rs"]
mod runtime_policy_tests;
