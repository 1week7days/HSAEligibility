# Schema

`data/hsa_eligible_items.json` is a JSON array. Each object represents one curated eligibility record.

## Item

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable kebab-case identifier. Do not rename after release unless the item is replaced. |
| `name` | string | yes | Display name. |
| `category` | string | yes | Human-readable category used for grouping. |
| `eligibility` | string | yes | One of `eligible`, `lmn_required`, `prescription_required`, `not_eligible`, or `uncertain`. |
| `requiresPrescription` | boolean | yes | Whether a prescription is required for this record. |
| `requiresLetterOfMedicalNecessity` | boolean | yes | Whether a letter of medical necessity is required for this record. |
| `aliases` | string[] | yes | Search terms and common alternate names. Use an empty array if none are known. |
| `notes` | string | yes | Short factual eligibility note. Avoid copied marketing text. |
| `sourceURL` | string | yes | URL supporting the eligibility record. Prefer IRS sources. |
| `lastUpdated` | string | yes | ISO 8601 date, `YYYY-MM-DD`, for the record's last review. |

## Compatibility

Keep field names and value types stable so clients can decode cached data across releases. Additive fields are allowed, but app clients should ignore unknown fields.

## Example

```json
{
  "id": "bandages",
  "name": "Bandages",
  "category": "First Aid",
  "eligibility": "eligible",
  "requiresPrescription": false,
  "requiresLetterOfMedicalNecessity": false,
  "aliases": ["adhesive bandages", "gauze bandages"],
  "notes": "Medical supplies used to treat an injury are generally qualified medical expenses.",
  "sourceURL": "https://www.irs.gov/publications/p502",
  "lastUpdated": "2026-06-07"
}
```
