# Security

This is a public hackathon demo, so the security model focuses on keeping the service stable, protecting secrets, limiting abuse, and being honest about production gaps.

## Implemented Controls

| Area | Control |
|------|---------|
| Transport | Cloud Run HTTPS and Helmet HSTS |
| Headers | Helmet security headers and CSP |
| Rate limiting | 30 requests/minute for AI routes, 300 requests/minute for data routes |
| Request size | JSON body capped at 16 KB |
| Validation | Zod validates required request shapes and field bounds |
| Sanitization | Submitted strings strip HTML tags and `javascript:` protocol |
| AI safety | Gemini system prompt tells the model to ignore prompt-injection instructions and use grounded tools |
| Secrets | Gemini key is stored in Secret Manager and injected into Cloud Run |
| Container | Docker image runs as a non-root `nodejs` user |
| Persistence | Firestore access uses the Cloud Run service account |
| Operator guard | Optional `ADMIN_TOKEN` protects task updates, escort creation, and simulation ticks |

## Content Security Policy

The deployed app keeps script execution strict:

```text
script-src 'self'
```

The current React UI still uses inline `style={{ ... }}` attributes, so the app intentionally allows:

```text
style-src 'self' 'unsafe-inline'
```

That is a known hardening opportunity. It is lower risk than allowing inline scripts, and the repo documents it explicitly instead of claiming a stricter CSP than the app actually uses.

## Validation Notes

Zod schemas validate route inputs, required fields, enum values, and length bounds. Unknown keys are not used by the application. A future hardening pass can add `.strict()` to all schemas if the project needs explicit rejection of unknown keys.

## Known Limitations

| Limitation | Risk | Production fix |
|------------|------|----------------|
| Volunteer routes have no user authentication | Medium | Cloud IAP or Firebase Auth; set `ADMIN_TOKEN` for operator-only API mutations |
| Fan IDs are pseudonymous but user supplied | Low | Server-issued session IDs |
| Inline style CSP allowance | Low | Move inline styles to classes/CSS variables or introduce nonce-based rendering |
| Simulation tick is open when `ADMIN_TOKEN` is unset | Low | Set `ADMIN_TOKEN` and send `x-admin-token` or a Bearer token |
| In-memory fallback is process-local | Low | Use Firestore in deployed production path |

## Security Checklist

- [x] No secrets committed
- [x] Secret Manager used for Gemini key
- [x] Service account used for Firestore/TTS
- [x] Rate limits on API routes
- [x] Input length caps
- [x] HTML/script sanitization before AI processing
- [x] Non-root container
- [x] Honest documentation of CSP and auth limitations
- [x] Optional constant-time admin token guard for mutating operator routes
