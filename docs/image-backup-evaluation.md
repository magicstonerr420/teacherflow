# Image backup evaluation

Evaluated on September 23, 2026 using the same TeacherFlow illustration briefs, 4:3 composition, and one image per request. Four classroom cases covered ages 5–7/A1 sharing supplies, ages 16–18/C2 persuasive communication, adults/C2 future society, and adults/A1 conservation. Each model received every brief. Provider endpoints and prices were checked before dispatch. These owner tests were separate from real teachers' lesson allowances and the shared beta budget.

| Model and pinned provider | Returned and decoded | Average recorded cost | Mean response time | Visual review |
| --- | --- | --- | --- | --- |
| Gemini 3.1 Flash Image Preview / Google AI Studio | 4/4 | $0.06843 | 9.64 seconds | Suitable primary; clear classroom scenes |
| Gemini 3.1 Flash Lite Image / Google Vertex global | 4/4 | $0.03364 | 3.69 seconds | Selected backup; age, language complexity, and target action remained usable across this sample |
| FLUX.2 Klein 4B / Black Forest Labs | 4/4 | $0.01500 | 4.58 seconds | Rejected for automatic use: teenagers appeared middle-aged, the sharing scene omitted a requested child, and the conservation scene had a malformed extra figure |

Total confirmed charge for 12 images: **$0.46829825**. All images passed TeacherFlow's byte/container validation and browser decoding. The four selected backup images also passed embedding into a real `.pptx` through TeacherFlow's existing presentation builder, without further image requests.

This is a small compatibility and visual-quality sample, not a reliability benchmark or evidence of a universal success rate. No natural provider failure occurred in these calls. Separate simulated failure tests exercise the exact production fallback path and billing guards. Teacher review is still required, particularly for nuanced concepts and small anatomical details.

The backup uses `google/gemini-3.1-flash-lite-image` pinned to `google-vertex/global` at 1K, one image per request. A single backup is allowed after confirmed missing-model responses or short rate-limit rejections after the normal delayed retries. Network timeouts, gateway errors, refused content, missing credentials, credit errors, and malformed successful deliveries do not automatically buy another image. Both models share the same logical operation for uncertain-charge protection and the same beta image slot. Runtime price checks and the existing round budget remain in force.

Review artifacts are local under `.local-runtime/image-backup-evaluation`: results and endpoint snapshots, original images, a comparison sheet, browser decode dimensions, and the PowerPoint compatibility check. No credential is included.

API behavior and endpoint discovery: [OpenRouter Image API documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation). Prices above are the actual reported test charges, not a promise of future prices.
