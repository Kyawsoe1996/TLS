# Thai SMB tooling: the "incumbent" a Bangkok tailor-shop app competes against

Note on currency: USD conversions use an assumed rate of about 33 THB = 1 USD (rounded; I did not fetch a live FX source). Research done 2026-10-26.

## 1. LINE in Thai business (users, LINE OA plans, MyShop, booking, notes, broadcast limits)

### Takeaway
LINE is the default channel between Thai shops and customers: about 56 million Thai users, more than Facebook. A LINE Official Account (OA) is free for up to 300 broadcast messages a month, and the paid plans cost THB 1,280–1,780 a month. Chat itself has no quota: the limits apply only to broadcast or push messages. LINE OA has light CRM features (chat tags and notes) and a shop module (MyShop, 3% fee), but no native tailoring workflow. Appointment booking comes from third-party add-ons. Any new app has to sit next to LINE, not replace it.

### Cited Findings
- LINE had 56 million users in Thailand (78.2% of the population) in January 2025. Facebook had 51.0 million, Messenger 35.9 million, Instagram 18.5 million and TikTok 34.0 million adults. Thailand has 65.4 million internet users (91.2%) and 99.5 million mobile connections. — [DataReportal Digital 2025 Thailand](https://datareportal.com/reports/digital-2025-thailand)
- LINE reports 56 million users in Thailand, more than 12 billion conversations through Official Accounts in 2025, about 800 million new OA friend adds in H1 2026, and 3+ million LINE Premium subscribers. These are LINE's own figures, reported via Marketing Oops, with no third-party check. LINE's 2026 business stack: verified OA badges, an "OA Chat Package" (keeps five years of chat history), MyShop (chat commerce with AI automation), MyTeam (planned for early 2027) and 1,000+ LINE MINI Apps. — [Relevant Audience, LINE Thailand 2026](https://www.relevantaudience.com/digital-marketing-en/line-thailand-business-solutions-2026/)
- Another write-up says 56 million monthly active users, or 82.6% of Thai internet users, in late 2025. — [Relevant Audience via search summary](https://www.relevantaudience.com/digital-marketing-en/line-thailand-business-solutions-2026/); also [yespress LINE Company Thailand](https://yespress.io/line-company-thailand)
- LINE OA plans from the official Thai pricing page (prices exclude 7% VAT):
  - **Free**: THB 0, 300 messages a month, no extra messages.
  - **Basic**: THB 1,280 (~USD 39) a month, 15,000 messages, extra messages THB 0.10 each.
  - **Pro**: THB 1,780 (~USD 54) a month, 35,000 messages, extra messages THB 0.06 each.

  — [LINE for Business TH, broadcast message](https://www.lineforbusiness.com/th/service/line-oa-features/broadcast-message)
- The Pro plan is reported to include the MyCustomer CRM. MyShop orders carry fees. — [yespress LINE Company Thailand](https://yespress.io/line-company-thailand)
- MyShop charges 3% per transaction, with 0% in the first month for new stores, and no subscription beyond the OA plan. This comes from a secondary or developer-tutorial source, so check it against LINE's MyShop page. — [LINE OA dev module (secondary)](https://than-is-on.duckdns.org/LINE_OA_DEV/module-11-thailand.html); MyShop described as storefront, inventory via chat commerce and payment options, with basic functions free — [LY Corp, LINE Conference Thailand 2025](https://www.lycorp.co.jp/en/story/20250530/lineconference.html)
- **Chat tags and notes (built-in light CRM):**
  - OA chat lets the shop tag customers (for example "VIP" or "Unpaid") and use those tags to target broadcasts.
  - The free tier allows 1 tag and 1 note per chat. The OA Chat package raises this to 30 tags and 1,000 notes per chat.
  - Notes are for preferences, birthdays and similar details, so this is where a tailor might jot measurements today.

  — [LINE OA help (TH)](https://help2.line.me/official_account_th/web/categoryId/20006370/pc?lang=en); [LINE for Business PDF on managing chats](https://lineforbusiness.com/files/1.9%20วิธีใช้%20LINE%20Official%20Account_วิธีจัดการแชทอย่างมีประสิทธิภาพ___1.pdf); [Krungsri: LINE tools for SMEs](https://www.krungsri.com/th/plearn-plearn/line-tools-for-sme)
- **Booking:** agencies describe LINE OA "queue reservation" and appointment systems for salons, clinics and spas. These are built by agencies or third parties on the Messaging API or MINI Apps, not a stock LINE OA feature. — [Cipher, LINE Official Account](https://www.cipher.co.th/en/line-official-account); [Relevant Audience, LINE OA service](https://relevantaudience.com/line-official-account)
- **Messaging API pricing** (message counting rules for push and broadcast) is on LINE's developer page. — [LINE Developers, Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/)
- **History:** LINE's 2020 OA pricing change, which cut free quotas, drew criticism from Thai SMEs. I did not open this article; see it for context. — [KrASIA](https://kr-asia.com/messaging-app-line-lambasted-for-raising-monthly-fees-for-thai-smes); [Bangkok Post](https://www.bangkokpost.com/business/1724687/line-draws-flak-over-changes)

### Inferences
- For a small tailor, LINE (often a personal account, or a free OA) already handles client chat, fabric and style photos, payment slips and "your suit is ready" messages. Its cost is zero, and the customer already has it installed. A new app wins only if it adds structure LINE lacks: measurement records per client, order status, deposits owed and fitting schedules. It must also hand off back to LINE: share links, deep links into LINE chat, and messages the owner can paste into LINE.
- The 300 free messages count only broadcast and push messages. One-to-one replies are not counted, so most micro-shops never pay LINE. That makes "free" the price anchor.
- Free chat notes (1 per chat) and tags (1 per chat) are too limited to hold structured measurements. This is a clear gap a tailoring app fills.

### Gaps
- I did not open a primary LINE page for the OA Chat package price or the MyCustomer feature list.
- I found no survey on what share of Thai micro-shops use a personal LINE account versus a LINE OA.
- LINE SHOPPING's status in 2025–26 (closed or merged into MyShop) is not confirmed.

## 2. Thai small-business POS and management apps, and their pricing

### Takeaway
Thai SME software is cheap. Plans run from free (Loyverse) to about THB 165–2,990 a month, and most tools are built for retail, F&B, e-commerce or accounting, not custom orders. Appointment and deposit features show up only in salon and spa POS tools (SeeU, EasePOS, Qashier). I found no Thai POS sold specifically to tailors.

### Cited Findings
- **Loyverse:**
  - The core POS is free.
  - Add-ons: unlimited sales history USD 5/month, employee management USD 5/month, advanced inventory USD 25/month.

  — [Capterra Loyverse](https://www.capterra.com/p/150632/Loyverse-POS/); [SaaSworthy Loyverse pricing](https://www.saasworthy.com/product/loyverse-pos/pricing)
- **Ocha POS** (Thai, Wongnai/LINE MAN group): software is THB 799/month (~USD 24). Hardware bundles cost THB 17,990–30,990 and include three months of software. — [emenuthailand, best restaurant POS Thailand 2026](https://emenuthailand.com/blog/tpost/best-restaurant-pos-systems-thailand-2026). Another source says the price is "not public" after a 3-month trial. — [SeeU salon POS comparison](https://seeuapp.io/en/for-business/blog/salon-pos-price-thailand). The App Store listing is [Ocha POS on the App Store](https://apps.apple.com/th/app/ocha-pos/id1144791811).
- **ZORT** (Thai, inventory and order management for online sellers):
  - Starter THB 600/month, Professional THB 1,500/month, Business THB 2,666.67/month.
  - ZORT POS starts at THB 809/month, with a 15-day free trial.

  — [ZORT package page](https://zortout.com/en/package); [ZORT POS package](https://zortout.com/en/package-pos); [software-listing review of Zort](https://software-listing.com/tools/zort/th)
- **FlowAccount** (Thai cloud accounting and e-tax documents): Free plan, Standard THB 199/month (THB 165/month billed yearly) and Pro THB 249/month for MobilePOS. — [FlowAccount Mobile POS](https://flowaccount.com/en/mobile-pos); [software-listing FlowAccount review](https://software-listing.com/tools/flowaccount)
- **Page365** (order management for Facebook and LINE chat sellers): monthly or yearly billing across Free, Solo, Pro, ProLive, SME and Enterprise tiers. I did not retrieve THB prices. — [Page365 plan pricing](https://www.page365.ph/plan-pricing); [Page365 Express](https://www.page365.net/page365express)
- **Salon and appointment POS in Thailand (closest analogue to a tailor's appointment-plus-order flow)**, from a vendor-written comparison dated 16 Oct 2026:
  - Loyverse: free, with add-ons from about THB 150.
  - Ocha: price not public.
  - Qashier: THB 266–399/month (THB 7,990–11,990/year). Booking is listed, but it is unclear which plan includes it.
  - EasePOS: THB 990–2,990/month, booking from the Silver plan.
  - SeeU: THB 990/month + 7% VAT, with booking and a "message on LINE" option.
  - Summary: "POS software for a salon in Thailand costs from free to 2,990 THB a month."

  This source is written by a vendor (SeeU), so expect bias. — [SeeU, Salon POS prices compared](https://seeuapp.io/en/for-business/blog/salon-pos-price-thailand)
- **Accounting:** Xero and QuickBooks are compared with Thai tools for expat-run businesses in Phuket. Thai-owned SMEs mostly use local tools (FlowAccount, PEAK). — [Phuket Expat Guide, accounting software comparison](https://phuketexpatguide.com/blog/phuket-accounting-software-comparison/); [syncedge, online accounting in Thailand, 7 compared](https://syncedge.tech/en/guides/accounting-software/)
- **Published price range:** Thai POS software runs from free to about THB 4,800/month. — [emenuthailand 2026 comparison (via search summary)](https://emenuthailand.com/blog/tpost/best-restaurant-pos-systems-thailand-2026)

### Inferences
- Price anchors for a Thai SME owner are free (Loyverse, the LINE OA free tier, FlowAccount Free), about THB 165–249/month (FlowAccount), and about THB 600–990/month (ZORT, Ocha, SeeU).
- The planned Pro tier at USD 9.99 (~THB 330) sits in the lower-middle of that range. The planned Premium tier at USD 24.99 (~THB 825) matches Ocha, ZORT POS and SeeU, which come with Thai-language support and Thai sales teams.
- None of the mainstream tools handles measurements, multi-fitting garment orders and deposit balances together. Tailors either force retail POS to fit or use no software at all.

### Gaps
- I could not verify prices for PEAK, StoreHub, SaleHere, Fillgoods, Wongnai POS (now merged into LINE MAN Wongnai's POS) or Page365 in THB within the call budget.
- I found no evidence of any Bangkok tailor using a specific POS.
- Shopee and Lazada seller tools are free to use, with commission-based fees. I did not research them because they don't fit made-to-measure.

## 3. Payments: PromptPay, deposits, tourists, e-Tax and VAT

### Takeaway
PromptPay QR is near-universal. A typical Thai customer pays a deposit by scanning the shop's QR (or by bank transfer) and sends the slip screenshot in LINE. Bangkok tourist tailors usually take about 50% at the first fitting. Since 30 Oct 2025, Chinese tourists can pay Thai QR codes with Alipay, WeChat Pay or UnionPay. Most small tailors are probably under the THB 1.8 million VAT threshold, so they don't need to issue full tax invoices.

### Cited Findings
- PromptPay had more than 81 million registered users as of March 2025 and processed more than 74 million transactions a day (BOT data, June 2025). In December 2025 it handled 2.38 billion transactions worth THB 4.70 trillion in the month. These come from aggregator blogs citing BOT, not BOT directly. — [Juspay, PromptPay reshaping Thailand](https://juspay.io/en-sg/blog/promptpay-reshaping-thailand-s-financial-landscape); [Mastercard, real-time payments in Thailand (2026)](https://www.mastercard.com/europe/en/news-and-trends/Insights/2026/real-time-payments-ignite-thailand-as-an-economic-force.html); [Tazapay, PromptPay for business](https://tazapay.com/en-sg/blog/promptpay-for-business-thailand-checkout-success)
- The Bank of Thailand launched cross-border QR payments with Alipay, UnionPay and WeChat Pay on 30 Oct 2025:
  - Chinese tourists scan Thai QR codes from participating banks (Bangkok Bank, Krungthai, KBank, ICBC Thai, SCB, BAAC; Krungsri, GSB, HSBC and TTB to follow).
  - The tourist pays in CNY and the merchant receives THB.
  - Thailand–China travel was 8.8 million people in 2024.

  — [Bank of Thailand press release](https://www.bot.or.th/en/news-and-media/news/news-20251030.html); [Khaosod English](https://www.khaosodenglish.com/tourism/2025/11/04/new-qr-payment-link-set-to-boost-thai-chinese-tourism-and-trade/)
- Bangkok tailors typically take a 50% deposit at the first fitting, with the balance paid at the last fitting. Suits start at about THB 8,000 (~USD 245). The usual turnaround is 3–5 days with 1–2 fittings. — [Nathan Tailors, Bangkok vs Hong Kong](https://www.nathantailors.com/zh/tailoring/bangkok-vs-hong-kong); [Time Out Bangkok, Om Fashion Bespoke Tailor](https://www.timeout.com/bangkok/shopping/om-fashion-bespoke-tailor); [View from the Wing, Empire Tailors (2014, older)](https://viewfromthewing.com/2014/12/27/getting-custom-tailored-suits-made-bangkok-empire-tailors/)
- VAT registration is required once annual turnover exceeds THB 1.8 million (~USD 55k), within 30 days. Registering below that is voluntary. The rate is 7%, extended by Royal Decree No. 799 (B.E. 2568) to 30 Sep 2026. — [Stripe, VAT in Thailand](https://stripe.com/resources/more/value-added-tax-vat-in-thailand); [FlowAccount, VAT guide 2026](https://flowaccount.com/blog/?p=27244)
- The Revenue Department has proposed lowering the THB 1.8 million threshold and possibly adding a 1% flat-rate scheme for micro businesses. This is a proposal, not law. — [VATCalc, threshold drop proposal](https://www.vatcalc.com/thailand/thailand-vat-registration-threshold-drop-proposal/)
- "e-Tax Invoice by Email" is open to VAT-registered businesses with turnover under THB 30 million. Invoices go out as PDF/A-3 by email, with the Revenue Department's central address copied, using ETDA time stamps. — [Rödl & Partner, e-Tax invoice and e-Receipt](https://www.roedl.com/insights/thailand-4-0-digital-economy-implementation-e-tax-invoice-e-receipt); [VATCalc, Thailand e-invoicing](https://www.vatcalc.com/thailand/thailand-e-invoicing-e-tax-and-invoice-receipt/)

### Inferences
- A tailoring app should record deposits by method (cash, PromptPay or transfer with a slip photo, card, Alipay/WeChat via Thai QR) and show the balance due at the final fitting.
- A PromptPay QR on the receipt or deposit request would match local habit. A PromptPay QR is a free, open EMVCo standard that a shop can generate from its phone number or tax ID.
- A non-VAT tailor needs only a simple receipt (ใบเสร็จรับเงิน), not a tax invoice. Full e-Tax compliance can wait for larger shops, or be handed off to FlowAccount or PEAK.

### Gaps
- I found no source for the deposit share among Thai domestic (non-tourist) dressmakers. The 50% figure comes from tourist-facing suit tailors.
- I found no data on how many small Bangkok shops accept cards.
- I had no direct BOT statistics page for the PromptPay figures. They come from secondary sources citing BOT.

## 4. Thailand PDPA: obligations for a small shop

### Takeaway
The PDPA has been in force since 1 June 2022 and applies to small shops. Body measurements are ordinary personal data. Photos used to identify someone can be biometric data, and health notes (for example a disability or a post-surgery fit) are sensitive data that need explicit consent. SMEs were exempted from keeping records of processing activities (RoPA) from 2025, but must still give a privacy notice, have a lawful basis or consent, keep data secure, and respect data-subject rights.

### Cited Findings
- The PDPA (B.E. 2562) took effect on 1 June 2022. — [HRM Asia](https://hrmasia.com/thailand-to-enforce-personal-data-protection-act-from-june-1/); [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/thailands-personal-data-protection-act-enters-into-force)
- The PDPC issued notifications in January 2025 exempting SMEs from keeping RoPAs. SMEs must still record any rejection of, or objection to, data-subject requests. The exemption is reported not to cover sensitive data. — [HSF Kramer note (2025)](https://www.hsfkramer.com/notes/data/2025-posts/exemption-for-smes-on-preparation-of-records-of-processing-activities-under-thai-privacy-laws); [Ecovis, PDPA exemption for SMEs](https://ecovis.com/global/?p=19138)
- The SME definition for service, retail and wholesale is 100 or fewer employees or annual revenue of THB 300 million or less. — [Ecovis](https://ecovis.com/global/?p=19138)
- Sensitive data includes race or ethnic origin, political opinion, beliefs, sexual behaviour, criminal records, health, disability, trade union membership, genetic and biometric data. Processing it needs explicit consent that is freely given, informed, in clear and plain language, and not misleading. — [KPMG Thailand legal news flash (2022)](https://assets.kpmg.com/content/dam/kpmg/th/pdf/2022/06/legal-news-flash-issue-14.pdf); [PwC overview](https://legal.pwc.de/content/im-fokus/thailand-global-data-protection-law-overview.pdf)
- **Penalties:**
  - Administrative fines go up to THB 5 million.
  - Criminal penalties for certain sensitive-data breaches or unlawful disclosure go up to 1 year in prison and/or a fine.
  - Failing to keep a RoPA (where required) can bring a fine of up to THB 1 million for a controller or THB 3 million for a processor.

  — [KPMG](https://assets.kpmg.com/content/dam/kpmg/th/pdf/2022/06/legal-news-flash-issue-14.pdf); [Ecovis](https://ecovis.com/global/?p=19138); [Kennedys, key PDPA compliance requirements](https://kennedyslaw.com/thought-leadership/article/guidelines-on-key-compliance-requirements-for-the-personal-data-protection-act-in-thailand)

### Inferences
- For a tailor app, the shop is the data controller and the app vendor is the data processor. That means:
  - The vendor needs a data processing agreement and published security practices.
  - The app should help the shop give a privacy notice (a ready-made Thai notice and a consent checkbox when a client is created).
  - The app needs export and delete-on-request functions.
  - Health or disability notes should be kept separate and marked as needing explicit consent.
- Hosting data outside Thailand needs cross-border transfer safeguards. A vendor should state where data is stored.

### Gaps
- I did not research whether Thai SME apps (Ocha, ZORT, FlowAccount) market PDPA compliance. I suspect FlowAccount does, but did not verify.
- I did not open the PDPC primary text (pdpc.or.th) because of the call budget.
- I found no enforcement cases against micro-shops.

## 5. Thai SME digital adoption, iOS vs Android, government programmes, willingness to pay

### Takeaway
Thailand is an Android-majority market: roughly 26–36% of mobile traffic is iOS in 2026, depending on the month and dataset. An iOS-only v1 therefore reaches only about a third of phones, probably skewed toward better-off, more urban owners (an inference). SME digital maturity is moderate (ETDA 2.45/4) and appetite to invest is low (about 92% have no digital investment plan, UTCC). Subsidies exist, such as the depa voucher of up to THB 10,000 and a 200% tax deduction for software on depa's register.

### Cited Findings
- StatCounter, Thailand mobile OS share:
  - **September 2026:** Android 73.96%, iOS 26.01%. — [StatCounter mobile OS Thailand](https://gs.statcounter.com/os-market-share/mobile/thailand)
  - **May 2026:** Android 68.43%, iOS 31.49%.
  - **August 2026** (mobile plus console dataset): Android 64.01%, iOS 35.95%.

  These figures come from search summaries of StatCounter pages, so the numbers swing from month to month and between datasets. — [StatCounter mobile-console Thailand](https://gs.statcounter.com/os-market-share/mobile-console/thailand); [StatCounter mobile-tablet-console Thailand](https://gs.statcounter.com/os-market-share/mobile-tablet-console/thailand)
- ETDA's 2025 Digital Maturity Index puts Thai SMEs at an average of 2.45 out of 4.00, up 3.81%. The government's "SMEs Growth 2026" programme involves depa and others. — [OpenGov Asia](https://opengovasia.com/thailand-expands-smes-growth-2026-programme-to-accelerate-digital-adoption/)
- A UTCC survey found about 92% of SMEs have no plan to invest in digital technology this year, and 5.9% do. The article is paywalled, so the date and sample size were not confirmed. — [Bangkok Post, "Small firms shun digital investment"](https://bangkokpost.com/business/general/2960796/small-firms-shun-digital-investment)
- The depa Mini Transformation Voucher covers 100% of software or digital services from registered providers, up to THB 10,000 (~USD 300) before VAT, one per SME. It is limited to Thai juristic persons in manufacturing and retail. More than 2,000 vouchers were issued against a target of 3,000. The year is not clear from the snippet. — [Nipa Cloud on depa voucher](https://web.nipa.cloud/?p=991); [depa transformation fund](https://www.depa.or.th/en/digitalservice/digital-transformation-fund/goals-and-areas)
- SMEs can claim a 200% tax deduction on software bought from depa-registered Thai providers. — [Forvis Mazars Thailand](https://www.forvismazars.com/th/en/insights/doing-business-in-thailand/tax/how-smes-benefit-from-the-200-tax-deduction); [Marketing Oops (TH)](https://www.marketingoops.com/news/tech-update/sme-tech-update/sme-depa-software); [Pattaya Mail](https://www.pattayamail.com/thailandnews/depa-offers-tax-deduction-200-software-purchases-smes-237040)
- depa targets 15,600 businesses with AI and digital grants in southern Thailand. — [thailand.go.th](https://www.thailand.go.th/issue-focus-detail/depa-targets-15600-businesses-with-ai-and-digital-grants-to-boost-competitiveness-in-southern-thailand)

### Inferences
- Common Thai SMB subscription price points (Section 2) cluster at about THB 165–250, THB 600–990 and THB 1,280–1,780 (LINE OA paid plans) per month.
- Many micro-tailors are sole proprietors, not juristic persons, so they don't qualify for the depa voucher or the 200% deduction. To benefit, a vendor would have to register with depa as a Thai provider, which needs a Thai entity.
- Low investment intent means a free tier and a quick first win (for example, a measurement card sent by LINE) matter more than a feature list.

### Gaps
- I found no OSMEP figure for the share of SMEs using any management software, and no Thai-SME willingness-to-pay survey in THB. The only academic willingness-to-pay study found was from 2015, on cloud services. — [KMITL repository](https://dspace.kmitl.ac.th/handle/123456789/7666); [ITS 2015 paper](https://ideas.repec.org/p/zbw/itsr15/146326.html)

## 6. Language and localisation expectations

### Takeaway
Every leading Thai SME tool (Ocha, ZORT, FlowAccount, Page365, LINE OA, SeeU) is Thai-first and sold with Thai-language support. I found no survey that measures acceptance of English-only apps. Thai UI, Thai dates and THB formatting should be treated as table stakes for Thai-owned shops. English-only may be acceptable only for tourist-facing, expat- or Indian-owned suit tailors in Sukhumvit and Silom.

### Cited Findings
- The leading local tools publish Thai-first sites and pricing:
  - LINE OA pricing is published in Thai, in THB, with prices excluding 7% VAT. — [LINE for Business TH](https://www.lineforbusiness.com/th/service/line-oa-features/broadcast-message)
  - ZORT publishes Thai reviews and pricing. — [software-listing Zort TH](https://software-listing.com/tools/zort/th)
  - Ocha's App Store listing is on the Thai store. — [App Store TH](https://apps.apple.com/th/app/ocha-pos/id1144791811)
- The domestic tailor profile below (Section 7) shows marketing done entirely in Thai on Facebook. — [MGR Online](https://mgronline.com/smes/detail/9660000088939)

### Inferences
- These localisation features are expected:
  - A Thai UI.
  - Buddhist-era (B.E., พ.ศ. = CE + 543) date display as an option. Thai receipts and government forms use B.E., as in "B.E. 2568" in the VAT decree above.
  - THB formatting with the ฿ sign and no decimals for whole-baht prices.
  - Measurements in centimetres, plus inches for suit tailors serving Western tourists.
  - A nickname field (ชื่อเล่น). Thais commonly go by nicknames, so client search should match nickname as well as full name.
  - Thai phone format (0X-XXXX-XXXX).
  - LINE ID as a contact field.

### Gaps
- I found no survey on English-only app acceptance among Thai shop owners.
- I found no source for Thai-language App Store ratings or reviews of English-only tools.

## 7. How Thai tailors and boutiques record measurements and orders today

### Takeaway
I found almost no published evidence on this. The one domestic tailor profile found shows a Facebook-marketed, phone-contact shop with no mention of software. Evidence on notebook and LINE-photo habits is anecdotal and not sourced here.

### Cited Findings
- Jetsadaporn tailor shop (Suphan Buri, provincial, 2023) profile:
  - Run by its owner for 15 years.
  - Markets in Facebook bridal and formal-wear groups and takes contact by phone.
  - Prices start at THB 1,800 (~USD 55).
  - Average monthly income is about THB 30,000 (~USD 900).
  - No software is mentioned.

  — [MGR Online SMEs](https://mgronline.com/smes/detail/9660000088939)
- Tourist tailors give a written quote listing fabric, number of pieces, fitting schedule and total price. — [Nathan Tailors](https://www.nathantailors.com/en/tailoring/bangkok-vs-phuket)

### Inferences
- The likely incumbent workflow (an inference, not documented):
  - A paper order book or measurement card.
  - LINE chat with photos of fabric, the style reference and the paper form.
  - A PromptPay slip screenshot as proof of deposit.
  - A phone or LINE reminder before the fitting.
- Monthly income of about THB 30,000 at a provincial tailor suggests that even THB 330/month (Pro tier) is about 1% of revenue. That is meaningful for micro-shops, so the free tier matters.

### Gaps
- I found no survey or article (Thai or English) quantifying paper, Excel, Google Sheets or LINE use among Thai tailors. Thai academic theses (Chula ETD, ThaiJO) on dressmaking-shop management may exist but were not reviewed: [Chula ETD](https://digital.car.chula.ac.th/chulaetd/70596); [ThaiJO article](https://so06.tci-thaijo.org/index.php/hsrnj/article/download/252299/174063/962687). Primary interviews with Bangkok tailors are recommended.
