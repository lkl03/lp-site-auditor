import type { AuditRule, AuditContext, Finding, PageData } from "./types";
import { SCORE_IMPACTS } from "./rubric";

function makeFinding(
  partial: Omit<Finding, "scoreImpact"> & { status: Finding["status"] }
): Finding {
  const impact = partial.status === "fail" || partial.status === "warning"
    ? SCORE_IMPACTS[partial.severity] ?? 0
    : 0;
  return { ...partial, scoreImpact: impact };
}

function allPages(ctx: AuditContext) {
  return ctx.pages.filter((p) => !p.error && p.statusCode >= 200 && p.statusCode < 400);
}

// ── URL ACCESSIBILITY ────────────────────────────────────────────────────────
export const ruleUrlAccessible: AuditRule = {
  id: "url-accessible",
  category: "Navigation & Links",
  title: "Site URL is accessible",
  severity: "CRITICAL",
  evaluate(ctx) {
    const root = ctx.pages[0];
    if (!root) {
      return [makeFinding({
        id: "url-accessible",
        category: "Navigation & Links",
        title: "Site URL is accessible",
        severity: "CRITICAL",
        status: "fail",
        evidence: ["No pages were returned from the scanner"],
        recommendation: "Ensure the URL is correct and the site is publicly accessible",
      })];
    }
    if (root.error || root.statusCode === 0) {
      return [makeFinding({
        id: "url-accessible",
        category: "Navigation & Links",
        title: "Site URL is accessible",
        severity: "CRITICAL",
        status: "fail",
        evidence: [root.error ?? "Could not connect to the site"],
        recommendation: "Verify the staging URL is correct, not password-protected, and publicly reachable",
        pageUrl: root.url,
      })];
    }
    if (root.statusCode >= 400) {
      return [makeFinding({
        id: "url-accessible",
        category: "Navigation & Links",
        title: "Site URL is accessible",
        severity: "CRITICAL",
        status: "fail",
        evidence: [`HTTP ${root.statusCode} returned for ${root.url}`],
        recommendation: "Fix the HTTP error or use the correct staging URL",
        pageUrl: root.url,
      })];
    }
    return [makeFinding({
      id: "url-accessible",
      category: "Navigation & Links",
      title: "Site URL is accessible",
      severity: "CRITICAL",
      status: "pass",
      evidence: [`HTTP ${root.statusCode} OK`],
      recommendation: "",
      pageUrl: root.url,
    })];
  },
};

// ── NO 404 PAGES ─────────────────────────────────────────────────────────────
export const ruleNo404Pages: AuditRule = {
  id: "no-404-pages",
  category: "Navigation & Links",
  title: "No 404 pages found",
  severity: "REQUIRED",
  evaluate(ctx) {
    const failed = ctx.pages.filter((p) => p.statusCode === 404);
    if (failed.length === 0) {
      return [makeFinding({
        id: "no-404-pages",
        category: "Navigation & Links",
        title: "No 404 pages found",
        severity: "REQUIRED",
        status: "pass",
        evidence: [`${ctx.pages.length} pages scanned, none returned 404`],
        recommendation: "",
      })];
    }
    return failed.map((p) =>
      makeFinding({
        id: "no-404-pages",
        category: "Navigation & Links",
        title: "404 page found",
        severity: "REQUIRED",
        status: "fail",
        evidence: [`${p.url} returned HTTP 404`],
        recommendation: "Fix or redirect this URL so it returns a valid page",
        pageUrl: p.url,
      })
    );
  },
};

// ── PAGE TITLES ──────────────────────────────────────────────────────────────
export const rulePageTitleExists: AuditRule = {
  id: "page-title-exists",
  category: "SEO",
  title: "Page has title",
  severity: "REQUIRED",
  evaluate(ctx) {
    return allPages(ctx).map((p) =>
      makeFinding({
        id: "page-title-exists",
        category: "SEO",
        title: "Page has title",
        severity: "REQUIRED",
        status: p.title ? "pass" : "fail",
        evidence: p.title ? [`Title: "${p.title}"`] : ["No <title> element found"],
        recommendation: p.title ? "" : "Add a unique SEO title to this page",
        pageUrl: p.url,
      })
    );
  },
};

export const rulePageTitleLength: AuditRule = {
  id: "page-title-length",
  category: "SEO",
  title: "Title length 45–61 chars",
  severity: "VERIFY",
  evaluate(ctx) {
    return allPages(ctx)
      .filter((p) => p.title)
      .map((p) => {
        const len = p.title.length;
        const ok = len >= 45 && len <= 61;
        return makeFinding({
          id: "page-title-length",
          category: "SEO",
          title: "Title length 45–61 chars",
          severity: "VERIFY",
          status: ok ? "pass" : "warning",
          evidence: [`"${p.title}" — ${len} characters`],
          recommendation: ok
            ? ""
            : `Adjust title to 45–61 characters (currently ${len}). LP SEO guidelines target this range`,
          pageUrl: p.url,
        });
      });
  },
};

export const ruleUniquePageTitles: AuditRule = {
  id: "unique-page-titles",
  category: "SEO",
  title: "Page titles are unique",
  severity: "REQUIRED",
  evaluate(ctx) {
    const good = allPages(ctx);
    const titleMap = new Map<string, string[]>();
    for (const p of good) {
      if (!p.title) continue;
      const key = p.title.toLowerCase().trim();
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key)!.push(p.url);
    }
    const findings: Finding[] = [];
    for (const [title, urls] of titleMap) {
      if (urls.length > 1) {
        findings.push(
          makeFinding({
            id: "unique-page-titles",
            category: "SEO",
            title: "Duplicate page title",
            severity: "REQUIRED",
            status: "fail",
            evidence: [`Title "${title}" appears on ${urls.length} pages:`, ...urls],
            recommendation: "Each page needs a unique title. Update duplicates to describe the specific page content",
          })
        );
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "unique-page-titles",
        category: "SEO",
        title: "Page titles are unique",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["All scanned pages have unique titles"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

// Meta descriptions and generic H1 checks are intentionally removed.
// This tool is a pre-QA orientation tool, not a generic SEO auditor.
// Keep only checklist-relevant SEO items (page titles, unique titles, OG image, canonical).

// ── FAVICON ──────────────────────────────────────────────────────────────────
export const ruleFaviconExists: AuditRule = {
  id: "favicon-exists",
  category: "Branding & Identity",
  title: "Custom favicon set",
  severity: "REQUIRED",
  evaluate(ctx) {
    const root = ctx.pages[0];
    if (!root) return [];
    const hasFavicon = !!root.favicon;
    return [makeFinding({
      id: "favicon-exists",
      category: "Branding & Identity",
      title: "Custom favicon set",
      severity: "REQUIRED",
      status: hasFavicon ? "pass" : "fail",
      evidence: hasFavicon ? [`Favicon: ${root.favicon}`] : ["No favicon link tag detected in <head>"],
      recommendation: hasFavicon ? "" : "Upload a custom favicon using the client's logo or brand mark",
      pageUrl: root.url,
    })];
  },
};

// ── HEADER NAV ───────────────────────────────────────────────────────────────
export const ruleHeaderNavLinksExist: AuditRule = {
  id: "header-nav-links-exist",
  category: "Global Elements",
  title: "Header navigation links exist",
  severity: "REQUIRED",
  evaluate(ctx) {
    const root = allPages(ctx)[0];
    if (!root) return [];
    const navLinks = root.links.filter((l) => {
      try {
        const u = new URL(l);
        return u.hostname === ctx.startUrl.hostname;
      } catch {
        return false;
      }
    });
    return [makeFinding({
      id: "header-nav-links-exist",
      category: "Global Elements",
      title: "Header navigation links exist",
      severity: "REQUIRED",
      status: navLinks.length >= 2 ? "pass" : "fail",
      evidence:
        navLinks.length >= 2
          ? [`${navLinks.length} internal navigation links found`]
          : ["Fewer than 2 internal links detected — nav may be missing or JS-rendered"],
      recommendation:
        navLinks.length >= 2
          ? ""
          : "Ensure the main navigation links are present in the HTML (not only JS-rendered)",
      pageUrl: root.url,
    })];
  },
};

// ── FOOTER CONTACT ────────────────────────────────────────────────────────────
export const ruleFooterContactExists: AuditRule = {
  id: "footer-contact-exists",
  category: "Global Elements",
  title: "Footer contact information present",
  severity: "REQUIRED",
  evaluate(ctx) {
    const root = allPages(ctx)[0];
    if (!root) return [];
    const hasContact = root.emails.length > 0 || root.phones.length > 0;
    return [makeFinding({
      id: "footer-contact-exists",
      category: "Global Elements",
      title: "Footer contact information present",
      severity: "REQUIRED",
      status: hasContact ? "pass" : "fail",
      evidence: hasContact
        ? [
            root.emails.length > 0 ? `Email: ${root.emails[0]}` : "",
            root.phones.length > 0 ? `Phone: ${root.phones[0]}` : "",
          ].filter(Boolean)
        : ["No phone or email address detected on the homepage"],
      recommendation: hasContact
        ? ""
        : "Add phone and email to the footer and contact overlay",
      pageUrl: root.url,
    })];
  },
};

// ── CONTACT INFO CONSISTENCY ──────────────────────────────────────────────────
export const ruleContactInfoConsistency: AuditRule = {
  id: "contact-info-consistency",
  category: "Global Elements",
  title: "Contact info consistent site-wide",
  severity: "REQUIRED",
  evaluate(ctx) {
    const good = allPages(ctx);
    const emailSets = good.map((p) => new Set(p.emails.map((e) => e.toLowerCase())));
    const phoneSets = good.map((p) => new Set(p.phones.map((ph) => ph.replace(/\D/g, ""))));

    const allEmails = [...new Set(good.flatMap((p) => p.emails.map((e) => e.toLowerCase())))];
    const allPhones = [...new Set(good.flatMap((p) => p.phones.map((ph) => ph.replace(/\D/g, ""))))];

    const inconsistentEmails = allEmails.length > 3;
    const inconsistentPhones = allPhones.length > 3;

    const problems: string[] = [];
    if (inconsistentEmails)
      problems.push(`${allEmails.length} different email addresses found: ${allEmails.slice(0, 4).join(", ")}`);
    if (inconsistentPhones)
      problems.push(`${allPhones.length} different phone numbers found across pages`);

    return [makeFinding({
      id: "contact-info-consistency",
      category: "Global Elements",
      title: "Contact info consistent site-wide",
      severity: "REQUIRED",
      status: problems.length > 0 ? "warning" : "pass",
      evidence:
        problems.length > 0
          ? problems
          : [
              `Email${allEmails.length > 1 ? "s" : ""}: ${allEmails.slice(0, 2).join(", ") || "none detected"}`,
              `Phone${allPhones.length > 1 ? "s" : ""}: ${good[0]?.phones.slice(0, 2).join(", ") || "none detected"}`,
            ],
      recommendation:
        problems.length > 0
          ? "Ensure the same phone and email appear consistently in the footer, contact overlay, about page, and contact page"
          : "",
    })];
  },
};

// ── EXPECTED EMAIL / PHONE ────────────────────────────────────────────────────
export const ruleExpectedEmailFound: AuditRule = {
  id: "expected-email-found",
  category: "Client Requests",
  title: "Expected email visible",
  severity: "REQUIRED",
  evaluate(ctx) {
    if (!ctx.expected.email) return [];
    const target = ctx.expected.email.toLowerCase();
    const found = ctx.pages.some((p) => p.emails.some((e) => e.toLowerCase().includes(target)));
    return [makeFinding({
      id: "expected-email-found",
      category: "Client Requests",
      title: "Expected email visible",
      severity: "REQUIRED",
      status: found ? "pass" : "fail",
      evidence: found
        ? [`Expected email "${ctx.expected.email}" found on site`]
        : [`Expected email "${ctx.expected.email}" was NOT found on any scanned page`],
      recommendation: found
        ? ""
        : `Add the email "${ctx.expected.email}" to the footer, contact overlay, and contact page`,
    })];
  },
};

export const ruleExpectedPhoneFound: AuditRule = {
  id: "expected-phone-found",
  category: "Client Requests",
  title: "Expected phone visible",
  severity: "REQUIRED",
  evaluate(ctx) {
    if (!ctx.expected.phone) return [];
    const normalTarget = ctx.expected.phone.replace(/\D/g, "");
    const found = ctx.pages.some((p) =>
      p.phones.some((ph) => ph.replace(/\D/g, "").includes(normalTarget))
    );
    return [makeFinding({
      id: "expected-phone-found",
      category: "Client Requests",
      title: "Expected phone visible",
      severity: "REQUIRED",
      status: found ? "pass" : "fail",
      evidence: found
        ? [`Expected phone "${ctx.expected.phone}" found on site`]
        : [`Expected phone "${ctx.expected.phone}" was NOT found on any scanned page`],
      recommendation: found
        ? ""
        : `Add the phone number "${ctx.expected.phone}" to the footer, contact overlay, and contact page`,
    })];
  },
};

// ── SOCIAL LINKS ──────────────────────────────────────────────────────────────
export const ruleSocialLinksValid: AuditRule = {
  id: "social-links-valid",
  category: "Global Elements",
  title: "Social links are valid external URLs",
  severity: "VERIFY",
  evaluate(ctx) {
    const root = allPages(ctx)[0];
    if (!root) return [];
    const invalid = root.socialLinks.filter((l) => {
      try {
        new URL(l);
        return false;
      } catch {
        return true;
      }
    });
    if (root.socialLinks.length === 0) {
      return [makeFinding({
        id: "social-links-valid",
        category: "Global Elements",
        title: "Social links present",
        severity: "VERIFY",
        status: "warning",
        evidence: ["No social media links detected on the homepage"],
        recommendation: "Add social media profile links to the footer and contact overlay",
        pageUrl: root.url,
      })];
    }
    return [makeFinding({
      id: "social-links-valid",
      category: "Global Elements",
      title: "Social links are valid external URLs",
      severity: "VERIFY",
      status: invalid.length > 0 ? "fail" : "pass",
      evidence:
        invalid.length > 0
          ? [`${invalid.length} invalid social URL(s): ${invalid.slice(0, 3).join(", ")}`]
          : [`${root.socialLinks.length} valid social link(s) found`],
      recommendation: invalid.length > 0 ? "Fix malformed social media URLs" : "",
      pageUrl: root.url,
    })];
  },
};

// ── BUTTONS ───────────────────────────────────────────────────────────────────
export const ruleNoEmptyButtons: AuditRule = {
  id: "no-empty-buttons",
  category: "Global Elements",
  title: "No empty button labels",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      const empty = page.buttons.filter((b) => !b.trim());
      if (empty.length > 0) {
        findings.push(makeFinding({
          id: "no-empty-buttons",
          category: "Global Elements",
          title: "Empty button label detected",
          severity: "REQUIRED",
          status: "fail",
          evidence: [`${empty.length} button(s) with no text found`],
          recommendation: "Add descriptive text to all buttons for accessibility and usability",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "no-empty-buttons",
        category: "Global Elements",
        title: "No empty button labels",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["All detected buttons have text labels"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

// ── IMAGES ────────────────────────────────────────────────────────────────────
export const ruleImagesNotBroken: AuditRule = {
  id: "images-not-broken",
  category: "Image Quality",
  title: "No broken images",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      const broken = page.images.filter(
        (img) => !img.src || img.src === "" || img.src.startsWith("data:") === false && img.src.length < 5
      );
      if (broken.length > 0) {
        findings.push(makeFinding({
          id: "images-not-broken",
          category: "Image Quality",
          title: "Potentially broken images",
          severity: "REQUIRED",
          status: "warning",
          evidence: [`${broken.length} image(s) with missing or empty src found`],
          recommendation: "Ensure all images have valid src attributes pointing to uploaded media",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "images-not-broken",
        category: "Image Quality",
        title: "No broken images detected",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["All scanned images have src attributes"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

export const ruleImagesHaveAlt: AuditRule = {
  id: "images-have-alt",
  category: "Image Quality",
  title: "Images have alt text",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      const missing = page.images.filter((img) => img.src && !img.alt);
      if (missing.length > 0) {
        findings.push(makeFinding({
          id: "images-have-alt",
          category: "Image Quality",
          title: "Images missing alt text",
          severity: "REQUIRED",
          status: "fail",
          evidence: [
            `${missing.length} image(s) missing alt text`,
            ...missing.slice(0, 3).map((img) => `  — ${img.src.slice(0, 80)}`),
          ],
          recommendation: "Add descriptive alt attributes to all meaningful images for accessibility and SEO",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "images-have-alt",
        category: "Image Quality",
        title: "Images have alt text",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["All scanned images have alt attributes"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

export const ruleNoPlaceholderImages: AuditRule = {
  id: "no-placeholder-images",
  category: "Branding & Identity",
  title: "No placeholder/default images",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      if (page.placeholderImages.length > 0) {
        findings.push(makeFinding({
          id: "no-placeholder-images",
          category: "Branding & Identity",
          title: "Placeholder images detected",
          severity: "REQUIRED",
          status: "fail",
          evidence: [
            `${page.placeholderImages.length} placeholder/default image(s) found:`,
            ...page.placeholderImages.slice(0, 3).map((s) => `  — ${s.slice(0, 80)}`),
          ],
          recommendation: "Replace all placeholder/default images with client-appropriate photography",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "no-placeholder-images",
        category: "Branding & Identity",
        title: "No placeholder images detected",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["No suspicious placeholder image filenames detected"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

// ── OG IMAGE ──────────────────────────────────────────────────────────────────
export const ruleOgImageExists: AuditRule = {
  id: "og-image-exists",
  category: "SEO",
  title: "Open Graph image set",
  severity: "REQUIRED",
  evaluate(ctx) {
    return allPages(ctx).map((p) =>
      makeFinding({
        id: "og-image-exists",
        category: "SEO",
        title: "Open Graph image set",
        severity: "REQUIRED",
        status: p.ogImage ? "pass" : "fail",
        evidence: p.ogImage ? [`og:image: ${p.ogImage.slice(0, 80)}`] : ["No og:image meta tag found"],
        recommendation: p.ogImage
          ? ""
          : "Set the SEO image for this page in the backend — it controls how the page appears when shared on social media",
        pageUrl: p.url,
      })
    );
  },
};

// ── CANONICAL ─────────────────────────────────────────────────────────────────
export const ruleCanonicalValid: AuditRule = {
  id: "canonical-valid",
  category: "SEO",
  title: "Canonical URL valid",
  severity: "VERIFY",
  evaluate(ctx) {
    return allPages(ctx)
      .filter((p) => p.canonical)
      .map((p) => {
        let valid = false;
        try {
          const u = new URL(p.canonical);
          valid = u.protocol === "http:" || u.protocol === "https:";
        } catch {}
        return makeFinding({
          id: "canonical-valid",
          category: "SEO",
          title: "Canonical URL valid",
          severity: "VERIFY",
          status: valid ? "pass" : "fail",
          evidence: [`canonical: ${p.canonical}`],
          recommendation: valid ? "" : "The canonical URL is not a valid absolute URL — fix or remove it",
          pageUrl: p.url,
        });
      });
  },
};

// ── VIEWPORT ──────────────────────────────────────────────────────────────────
export const ruleViewportMetaExists: AuditRule = {
  id: "viewport-meta-exists",
  category: "Mobile / Responsive",
  title: "Viewport meta tag present",
  severity: "REQUIRED",
  evaluate(ctx) {
    const root = allPages(ctx)[0];
    if (!root) return [];
    return [makeFinding({
      id: "viewport-meta-exists",
      category: "Mobile / Responsive",
      title: "Viewport meta tag present",
      severity: "REQUIRED",
      status: root.viewportMeta ? "pass" : "fail",
      evidence: root.viewportMeta
        ? ['<meta name="viewport"> found']
        : ['No <meta name="viewport"> tag detected'],
      recommendation: root.viewportMeta
        ? ""
        : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>',
      pageUrl: root.url,
    })];
  },
};

// ── FORMS ─────────────────────────────────────────────────────────────────────
export const ruleFormsHaveInputs: AuditRule = {
  id: "forms-have-inputs",
  category: "Forms & Lead Routing",
  title: "Forms have input fields",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      const emptyForms = page.forms.filter((f) => f.inputs === 0);
      if (emptyForms.length > 0) {
        findings.push(makeFinding({
          id: "forms-have-inputs",
          category: "Forms & Lead Routing",
          title: "Form with no inputs detected",
          severity: "REQUIRED",
          status: "fail",
          evidence: [`${emptyForms.length} form(s) detected with no input fields`],
          recommendation: "Ensure all forms have the required input fields (name, email, message, etc.)",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      const allForms = ctx.pages.flatMap((p) => p.forms).length;
      findings.push(makeFinding({
        id: "forms-have-inputs",
        category: "Forms & Lead Routing",
        title: "Forms have input fields",
        severity: "REQUIRED",
        status: allForms > 0 ? "pass" : "warning",
        evidence: allForms > 0 ? [`${allForms} form(s) found with inputs`] : ["No forms detected on scanned pages"],
        recommendation: allForms > 0 ? "" : "Ensure contact forms are present on the site",
      }));
    }
    return findings;
  },
};

export const ruleFormsHaveSubmit: AuditRule = {
  id: "forms-have-submit",
  category: "Forms & Lead Routing",
  title: "Forms have submit button",
  severity: "REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const page of allPages(ctx)) {
      const noSubmit = page.forms.filter((f) => !f.hasSubmit);
      if (noSubmit.length > 0) {
        findings.push(makeFinding({
          id: "forms-have-submit",
          category: "Forms & Lead Routing",
          title: "Form missing submit button",
          severity: "REQUIRED",
          status: "fail",
          evidence: [`${noSubmit.length} form(s) without a submit button detected`],
          recommendation: "Add a visible submit button to all contact/lead forms",
          pageUrl: page.url,
        }));
      }
    }
    if (findings.length === 0) {
      findings.push(makeFinding({
        id: "forms-have-submit",
        category: "Forms & Lead Routing",
        title: "Forms have submit buttons",
        severity: "REQUIRED",
        status: "pass",
        evidence: ["All detected forms have submit buttons"],
        recommendation: "",
      }));
    }
    return findings;
  },
};

// ── COMPLIANCE ────────────────────────────────────────────────────────────────
export const ruleProhibitedOffMarket: AuditRule = {
  id: "prohibited-off-market-term",
  category: "Compliance",
  title: 'No "Off-Market" text',
  severity: "CRITICAL",
  evaluate(ctx) {
    const offendingPages = ctx.pages.filter((p) => p.prohibitedTerms.length > 0);
    if (offendingPages.length === 0) {
      return [makeFinding({
        id: "prohibited-off-market-term",
        category: "Compliance",
        title: 'No "Off-Market" text',
        severity: "CRITICAL",
        status: "pass",
        evidence: ['No "Off-Market" or "Off Market" text detected'],
        recommendation: "",
      })];
    }
    return offendingPages.map((p) =>
      makeFinding({
        id: "prohibited-off-market-term",
        category: "Compliance",
        title: '"Off-Market" prohibited term found',
        severity: "CRITICAL",
        status: "fail",
        evidence: [
          `Prohibited term(s) found: ${p.prohibitedTerms.join(", ")}`,
          `Page: ${p.url}`,
        ],
        recommendation: 'Remove all instances of "Off-Market" and "Off Market" from the site — this term is prohibited',
        pageUrl: p.url,
      })
    );
  },
};

export const ruleComplianceDisclaimerDetected: AuditRule = {
  id: "compliance-disclaimer-detected",
  category: "Compliance",
  title: "IDX/MLS disclaimer detected",
  severity: "VERIFY",
  evaluate(ctx) {
    const hasDisclaimer = ctx.pages.some((p) => p.disclaimers.length > 0);
    const keywords = [...new Set(ctx.pages.flatMap((p) => p.disclaimers))];
    return [makeFinding({
      id: "compliance-disclaimer-detected",
      category: "Compliance",
      title: "IDX/MLS disclaimer detected",
      severity: "VERIFY",
      status: hasDisclaimer ? "pass" : "warning",
      evidence: hasDisclaimer
        ? [`Disclaimer keywords found: ${keywords.slice(0, 5).join(", ")}`]
        : ["No IDX/MLS disclaimer text detected — verify manually if IDX is enabled"],
      recommendation: hasDisclaimer
        ? ""
        : "If this site has IDX/MLS listings, ensure the required disclaimers are present per MLS rules",
    })];
  },
};

export const ruleLicenseNumberDetected: AuditRule = {
  id: "license-number-detected",
  category: "Compliance",
  title: "License number present",
  severity: "VERIFY",
  evaluate(ctx) {
    const allLicenses = [...new Set(ctx.pages.flatMap((p) => p.licenseNumbers))];
    return [makeFinding({
      id: "license-number-detected",
      category: "Compliance",
      title: "License number present",
      severity: "VERIFY",
      status: allLicenses.length > 0 ? "pass" : "warning",
      evidence:
        allLicenses.length > 0
          ? [`License numbers found: ${allLicenses.slice(0, 3).join(", ")}`]
          : ["No DRE/license number pattern detected — verify manually based on state requirements"],
      recommendation:
        allLicenses.length > 0
          ? ""
          : "Check state requirements for license number display — some states require DRE# or license numbers on real estate websites",
    })];
  },
};

// ── EXPECTED PAGES ────────────────────────────────────────────────────────────
export const ruleExpectedPagesFound: AuditRule = {
  id: "expected-pages-found",
  category: "Client Requests",
  title: "Expected pages present",
  severity: "CRITICAL",
  evaluate(ctx) {
    if (!ctx.expected.pages || ctx.expected.pages.length === 0) return [];
    const scannedUrls = ctx.pages.map((p) => p.url.toLowerCase());
    const findings: Finding[] = [];
    for (const expectedPage of ctx.expected.pages) {
      const slug = expectedPage.toLowerCase().replace(/\s+/g, "-");
      const found = scannedUrls.some(
        (u) => u.includes(slug) || u.includes(expectedPage.toLowerCase())
      );
      findings.push(makeFinding({
        id: "expected-pages-found",
        category: "Client Requests",
        title: `Expected page: ${expectedPage}`,
        severity: "CRITICAL",
        status: found ? "pass" : "fail",
        evidence: found
          ? [`Page matching "${expectedPage}" found in scanned URLs`]
          : [`No page matching "${expectedPage}" found — may not have been built or not linked`],
        recommendation: found
          ? ""
          : `Build and link the "${expectedPage}" page as requested in the onboarding hub`,
      }));
    }
    return findings;
  },
};

export const ruleExpectedAgentsFound: AuditRule = {
  id: "expected-agents-found",
  category: "Client Requests",
  title: "Expected agents present",
  severity: "CRITICAL",
  evaluate(ctx) {
    if (!ctx.expected.agents || ctx.expected.agents.length === 0) return [];
    const allText = ctx.pages.map((p) => p.textSample.toLowerCase()).join(" ");
    const findings: Finding[] = [];
    for (const agent of ctx.expected.agents) {
      const found = allText.includes(agent.toLowerCase());
      findings.push(makeFinding({
        id: "expected-agents-found",
        category: "Client Requests",
        title: `Expected agent: ${agent}`,
        severity: "CRITICAL",
        status: found ? "pass" : "fail",
        evidence: found
          ? [`Agent name "${agent}" appears in scanned page text`]
          : [`Agent name "${agent}" was not found in any scanned page`],
        recommendation: found
          ? ""
          : `Add agent profile for "${agent}" as requested in the onboarding hub`,
      }));
    }
    return findings;
  },
};

export const ruleExpectedNeighborhoodsFound: AuditRule = {
  id: "expected-neighborhoods-found",
  category: "Client Requests",
  title: "Expected neighborhoods present",
  severity: "CRITICAL",
  evaluate(ctx) {
    if (!ctx.expected.neighborhoods || ctx.expected.neighborhoods.length === 0) return [];
    const allText = ctx.pages.map((p) => p.textSample.toLowerCase()).join(" ");
    const findings: Finding[] = [];
    for (const hood of ctx.expected.neighborhoods) {
      const found = allText.includes(hood.toLowerCase());
      findings.push(makeFinding({
        id: "expected-neighborhoods-found",
        category: "Client Requests",
        title: `Expected neighborhood: ${hood}`,
        severity: "CRITICAL",
        status: found ? "pass" : "fail",
        evidence: found
          ? [`"${hood}" found in scanned page content`]
          : [`Neighborhood "${hood}" was not detected in any scanned page`],
        recommendation: found
          ? ""
          : `Add a neighborhood page or section for "${hood}" as requested`,
      }));
    }
    return findings;
  },
};

// ── HOME SEARCH / MLS VISIBLE ────────────────────────────────────────────────
/**
 * Checks that /home-search exists and contains MLS listing signals.
 * Always scanned because LP always builds a home-search/IDX page.
 *
 * Pass:    /home-search returns 200 AND has listing signals in HTML
 * Warning: /home-search returns 200 but no listing signals (likely JS-rendered IDX)
 * Fail:    /home-search returns 404 or could not be fetched
 */
export const ruleHomeSearchMlsVisible: AuditRule = {
  id: "home-search-mls-visible",
  category: "Property Pages",
  title: "Home search / MLS listings visible",
  severity: "REQUIRED",
  evaluate(ctx) {
    const homeSearchPage = ctx.pages.find((p) =>
      p.url.toLowerCase().includes("/home-search")
    );

    if (!homeSearchPage || homeSearchPage.error || homeSearchPage.statusCode === 0) {
      return [makeFinding({
        id: "home-search-mls-visible",
        category: "Property Pages",
        title: "Home search page not scanned",
        severity: "REQUIRED",
        status: "fail",
        evidence: homeSearchPage?.error
          ? [`/home-search fetch failed: ${homeSearchPage.error}`]
          : ["No /home-search page found — may not have been crawled yet"],
        recommendation:
          "Ensure /home-search exists and is publicly accessible. LP sites always include a home search / IDX page. Verify the URL returns 200 on staging.",
      })];
    }

    if (homeSearchPage.statusCode === 404 || homeSearchPage.statusCode >= 400) {
      return [makeFinding({
        id: "home-search-mls-visible",
        category: "Property Pages",
        title: "Home search page returns 404",
        severity: "REQUIRED",
        status: "fail",
        evidence: [`/home-search returned HTTP ${homeSearchPage.statusCode}`],
        recommendation:
          "The /home-search page returned a 4xx error. Verify the IDX/home search page exists and is published. Check for typos in the URL slug.",
        pageUrl: homeSearchPage.url,
      })];
    }

    if (!homeSearchPage.hasListingSignals) {
      return [makeFinding({
        id: "home-search-mls-visible",
        category: "Property Pages",
        title: "Home search loaded but no MLS signals detected",
        severity: "REQUIRED",
        status: "warning",
        evidence: [
          `/home-search returned HTTP ${homeSearchPage.statusCode} — page loaded`,
          "No IDX/listing keywords detected in HTML — content is likely JS-rendered",
        ],
        recommendation:
          "Visit /home-search on the staging site and verify IDX listings are displaying. If listings load via JavaScript (React/Vue/IDX widget), this tool cannot detect them — a manual check is required.",
        pageUrl: homeSearchPage.url,
      })];
    }

    return [makeFinding({
      id: "home-search-mls-visible",
      category: "Property Pages",
      title: "Home search / MLS listings visible",
      severity: "REQUIRED",
      status: "pass",
      evidence: [
        `/home-search returned HTTP ${homeSearchPage.statusCode}`,
        "IDX/listing signals detected in page HTML",
      ],
      recommendation: "",
      pageUrl: homeSearchPage.url,
    })];
  },
};

// ── HOMEPAGE HERO ─────────────────────────────────────────────────────────────
export const ruleHomepageHeroExists: AuditRule = {
  id: "homepage-hero-exists",
  category: "Homepage",
  title: "Hero/opener section exists",
  severity: "REQUIRED",
  evaluate(ctx) {
    const root = allPages(ctx)[0];
    if (!root) return [];
    return [makeFinding({
      id: "homepage-hero-exists",
      category: "Homepage",
      title: "Hero/opener section exists",
      severity: "REQUIRED",
      status: root.hasHero || root.images.length > 0 ? "pass" : "warning",
      evidence:
        root.hasHero
          ? ["Hero/opener element detected"]
          : root.images.length > 0
          ? [`${root.images.length} images found — hero may be present but not using expected class names`]
          : ["No hero section or images detected on homepage"],
      recommendation:
        root.hasHero || root.images.length > 0
          ? ""
          : "Ensure the homepage has a clear hero/opener with an image or video, headline, and CTA",
      pageUrl: root.url,
    })];
  },
};

// ── HUMAN REVIEW ITEMS ────────────────────────────────────────────────────────
export const humanReviewRules: AuditRule[] = [
  {
    id: "onboarding-requests-delivered",
    category: "Client Requests",
    title: "All onboarding requests delivered",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "onboarding-requests-delivered",
        category: "Client Requests",
        title: "All onboarding hub requests delivered",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Cannot be verified automatically — requires reading the onboarding hub"],
        recommendation: "Cross-reference your build notes from Phase 1 against what was built. Re-read the onboarding hub one final time",
      })];
    },
  },
  {
    id: "color-palette-human-review",
    category: "Branding & Identity",
    title: "Color palette matches brand",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "color-palette-human-review",
        category: "Branding & Identity",
        title: "Color palette matches brand spec",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Color accuracy cannot be verified from URL alone"],
        recommendation: "Verify that primary, accent, and background colors match the client style guide, moodboard, or brokerage requirements. Document hex codes in chatter post",
      })];
    },
  },
  {
    id: "typography-human-review",
    category: "Branding & Identity",
    title: "Typography correct",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "typography-human-review",
        category: "Branding & Identity",
        title: "Typography matches spec",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Font rendering cannot be verified from URL alone"],
        recommendation: "Verify that headline and body fonts match the moodboard/brand spec and brokerage requirements. Check font weight consistency",
      })];
    },
  },
  {
    id: "mobile-visual-walkthrough",
    category: "Mobile / Responsive",
    title: "Mobile visual walkthrough",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "mobile-visual-walkthrough",
        category: "Mobile / Responsive",
        title: "Full mobile visual walkthrough",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Visual mobile rendering cannot be verified without a real device or Playwright"],
        recommendation: "Browse every page on a real mobile device or Chrome DevTools mobile mode. Check: hero title not cut off, nav works, content centered, padding correct, no overflow",
      })];
    },
  },
  {
    id: "lead-routing-human-review",
    category: "Forms & Lead Routing",
    title: "Lead routing verified",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "lead-routing-human-review",
        category: "Forms & Lead Routing",
        title: "Lead routing goes to correct CRM/email",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Form submission destinations cannot be verified without submitting a test lead"],
        recommendation: "Submit a test lead via each contact form and verify it arrives in the correct CRM or email inbox",
      })];
    },
  },
  {
    id: "image-relevance-human-review",
    category: "Image Quality",
    title: "Image relevance to market/brand",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "image-relevance-human-review",
        category: "Image Quality",
        title: "Images match client's location and brand",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Image relevance and quality cannot be assessed from URL alone"],
        recommendation: "Verify all images are: high quality, not editorial-use-only, relevant to client's market, architectural style, and brand — not generic stock photos",
      })];
    },
  },
  {
    id: "brokerage-compliance-human-review",
    category: "Compliance",
    title: "Brokerage compliance verified",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "brokerage-compliance-human-review",
        category: "Compliance",
        title: "Brokerage compliance verified",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Brokerage-specific compliance rules must be verified manually"],
        recommendation: "Refer to the Launch Bible and Coda compliance docs for your specific brokerage (Compass, SIR, CB, etc.). Verify logo usage, disclaimer text, colors, and fonts",
      })];
    },
  },
  {
    id: "content-migration-human-review",
    category: "Final Validation",
    title: "Content migration complete",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "content-migration-human-review",
        category: "Final Validation",
        title: "Content migration from previous site complete",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Content migration completeness cannot be verified from URL alone"],
        recommendation: "Cross-reference the current site against the previous site: agents, bios, properties, blogs, neighborhoods, custom pages. Verify nothing critical is missing",
      })];
    },
  },
  {
    id: "spelling-grammar-human-review",
    category: "Final Validation",
    title: "Spelling and grammar checked",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "spelling-grammar-human-review",
        category: "Final Validation",
        title: "Spelling and grammar verified",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Spelling and grammar checking requires Grammarly or WordTune"],
        recommendation: "Run all pages through Grammarly or WordTune. Verify proper casing, punctuation, and consistency",
      })];
    },
  },
];

/** Base rules that always run regardless of context. */
export const BASE_RULES: AuditRule[] = [
  ruleUrlAccessible,
  ruleNo404Pages,
  rulePageTitleExists,
  rulePageTitleLength,
  ruleUniquePageTitles,
  ruleFaviconExists,
  ruleHeaderNavLinksExist,
  ruleFooterContactExists,
  ruleContactInfoConsistency,
  ruleExpectedEmailFound,
  ruleExpectedPhoneFound,
  ruleSocialLinksValid,
  ruleNoEmptyButtons,
  ruleImagesNotBroken,
  ruleImagesHaveAlt,
  ruleNoPlaceholderImages,
  ruleOgImageExists,
  ruleCanonicalValid,
  ruleViewportMetaExists,
  ruleFormsHaveInputs,
  ruleFormsHaveSubmit,
  ruleProhibitedOffMarket,
  ruleComplianceDisclaimerDetected,
  ruleLicenseNumberDetected,
  ruleExpectedPagesFound,
  ruleExpectedAgentsFound,
  ruleExpectedNeighborhoodsFound,
  ruleHomeSearchMlsVisible,
  ruleHomepageHeroExists,
  ...humanReviewRules,
];

/** @deprecated Use BASE_RULES + selectContextRules(ctx) instead. */
export const ALL_RULES = BASE_RULES;
