# Lighthouse Results

Captured from the deployed Cloud Run demo on July 19, 2026 using Lighthouse 13.3.0 in Chrome 150.0.0.0. The run used the emulated Moto G Power, single-page initial-load mode, and slow 4G throttling.

Live URLs:

- Volunteer Dashboard: https://promptwars-smart-stadium-241555494310.asia-south1.run.app/volunteer
- Fan Portal: https://promptwars-smart-stadium-241555494310.asia-south1.run.app/fan

## Captured score

The supplied capture was taken on the Volunteer Dashboard.

| View | Performance | Accessibility | Best Practices | SEO |
|------|-------------:|---------------:|---------------:|----:|
| Volunteer Dashboard | 89 | 96 | 92 | 82 |
| Fan Portal | Pending separate capture | Pending | Pending | Pending |

## Core metrics

| Metric | Result |
|--------|--------|
| First Contentful Paint | 2.9 s |
| Largest Contentful Paint | 3.1 s |
| Total Blocking Time | 30 ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 2.9 s |

## Findings to address after the hackathon

- Performance diagnostics estimate 571 KiB of unused JavaScript and 66 KiB of minification savings.
- Six long main-thread tasks and 16 non-composited animated elements were detected.
- Accessibility reported an insufficient foreground/background contrast opportunity; manually review the affected component states.
- Best Practices reported browser console/Issues-panel errors during the capture; inspect a clean production session before release.
- SEO reported no meta description and an invalid `robots.txt` with 14 errors.

The strong accessibility and best-practices scores support the judge walkthrough. The SEO findings mainly affect crawler discoverability, not the authenticated-style interactive hackathon demo.
