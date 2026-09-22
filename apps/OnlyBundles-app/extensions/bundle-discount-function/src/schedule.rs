use shopify_function::wasm_api::{Deserialize, Value};

#[derive(shopify_function::Deserialize)]
#[shopify_function(rename_all="camelCase")]
struct Recurrence {
    recurrence_frequency: String,
    recurrence_anchor_date: String,
    recurrence_termination: String,
    recurrence_ends_on: Option<String>,
    recurrence_run_count: Option<i64>,
}

pub fn date_is_active(value:&Value,local_date:&str)->bool {
    let Ok(schedule)=Recurrence::deserialize(value) else { return false; };
    let Some(anchor)=date(&schedule.recurrence_anchor_date) else { return false; };
    let Some(today)=date(local_date) else { return false; };
    if today < anchor { return false; }
    let occurrence = match schedule.recurrence_frequency.as_str() {
        "weekly" => {
            let days=ordinal(today)-ordinal(anchor);
            if days % 7 != 0 { return false; }
            days/7+1
        },
        "monthly" => {
            if today.2 != anchor.2 { return false; }
            let mut count=0;
            for year in anchor.0..=today.0 {
                let start=if year==anchor.0 {anchor.1} else {1};
                let end=if year==today.0 {today.1} else {12};
                for month in start..=end { if anchor.2 <= days_in_month(year,month) {count+=1;} }
            }
            count
        },
        _=>return false,
    };
    match schedule.recurrence_termination.as_str() {
        "never"=>true,
        "on_date"=>schedule.recurrence_ends_on.as_deref().and_then(date).is_some_and(|end| today<=end),
        "after_runs"=>schedule.recurrence_run_count.is_some_and(|limit| limit>0 && occurrence<=limit),
        _=>false,
    }
}
fn date(value:&str)->Option<(i64,i64,i64)> {
    let mut pieces=value.split('-');
    let year=pieces.next()?.parse().ok()?; let month=pieces.next()?.parse().ok()?; let day=pieces.next()?.parse().ok()?;
    if pieces.next().is_some() || !(1..=9999).contains(&year) || !(1..=12).contains(&month) || day<1 || day>days_in_month(year,month) {return None;}
    Some((year,month,day))
}
fn days_in_month(year:i64,month:i64)->i64 {
    match month {4|6|9|11=>30,2=>if year%4==0 && (year%100!=0 || year%400==0) {29} else {28},_=>31}
}
fn ordinal((year,month,day):(i64,i64,i64))->i64 {
    let previous=year-1;
    365*previous+previous/4-previous/100+previous/400+(1..month).map(|month|days_in_month(year,month)).sum::<i64>()+day
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn active(frequency:&str,anchor:&str,today:&str,termination:&str,count:i64,end:Option<&str>)->bool {
        let context=shopify_function::wasm_api::Context::new_with_input(json!({"recurrenceFrequency":frequency,"recurrenceAnchorDate":anchor,
            "recurrenceTermination":termination,"recurrenceRunCount":count,"recurrenceEndsOn":end}));
        date_is_active(&context.input_get().unwrap(),today)
    }
    #[test]
    fn weekly_anchor_and_run_count_are_enforced() {
        assert!(active("weekly","2026-09-05","2026-09-19","after_runs",3,None));
        assert!(!active("weekly","2026-09-05","2026-09-26","after_runs",3,None));
        assert!(!active("weekly","2026-09-05","2026-09-20","never",0,None));
        assert!(!active("weekly","2026-09-05","2026-09-19","on_date",0,Some("2026-09-18")));
    }
    #[test]
    fn monthly_skips_missing_calendar_dates_and_counts_only_occurrences() {
        assert!(active("monthly","2024-01-31","2024-03-31","after_runs",2,None));
        assert!(!active("monthly","2024-01-31","2024-05-31","after_runs",2,None));
        assert!(active("monthly","2024-01-29","2024-02-29","after_runs",2,None));
        assert!(!active("monthly","2025-01-29","2025-02-28","never",0,None));
    }
}
