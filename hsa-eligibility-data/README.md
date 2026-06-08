# HSA Eligibility Data

Curated seed data for HSA-eligible items. This repository is intended to be public so apps can fetch the raw JSON without authentication and cache it locally.

## Raw JSON URL

After publishing this repository to GitHub, point the app at:

```text
https://raw.githubusercontent.com/YOUR_USERNAME/hsa-eligibility-data/main/data/hsa_eligible_items.json
```

For the iOS app, set:

```text
HSAEligibilityRemoteSeedURL = https://raw.githubusercontent.com/YOUR_USERNAME/hsa-eligibility-data/main/data/hsa-eligibility-list.json
```

Replace `YOUR_USERNAME` with the GitHub owner.

## Data File

- `data/hsa_eligible_items.json` contains a JSON array of eligibility records.
- Every item includes `sourceURL` and `lastUpdated`.
- Primary sources should be IRS publications where available.
- Consumer-facing sources can be used for practical retail-category references, but do not copy proprietary store descriptions or catalogs wholesale.

## Release Tags

Use date-based tags when you want stable app seed versions:

```text
v2026.06.07
```

For development and small apps, GitHub raw is acceptable. For higher traffic, move the JSON to Firebase Hosting, Cloudflare R2, S3, or an app backend.

## Disclaimer

This data is for product and reimbursement guidance only. HSA eligibility can depend on facts, timing, plan rules, and documentation. Users should keep receipts and consult a tax professional or plan administrator for edge cases.
