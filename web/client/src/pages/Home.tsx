import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Headphones,
  Languages,
  LockKeyhole,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import "./Home.css";

const waveform = [
  18, 31, 23, 42, 29, 51, 35, 62, 44, 29, 53, 36, 68, 45, 33, 57, 40, 74,
  52, 34, 60, 42, 28, 49, 35, 58, 39, 24, 45, 31, 54, 37,
];

function Brand() {
  return (
    <Link to="/" className="diya-brand" aria-label="Diya home">
      <span className="diya-brand-mark" aria-hidden="true">d</span>
      <span>diya</span>
    </Link>
  );
}

export default function Home() {
  const { status, activeTenant, isSuperAdmin } = useAuth();

  const operatorHref = status !== "authenticated"
    ? "/sign-in"
    : activeTenant
      ? `/console?tenantSlug=${encodeURIComponent(activeTenant.slug)}`
      : isSuperAdmin
        ? "/platform/tenants"
        : "/select-workspace";
  const operatorLabel = status === "authenticated" ? "Open workspace" : "Operator sign in";
  const workflowHref = status === "authenticated" ? operatorHref : "/sign-in";
  const workflowState = status === "authenticated" ? undefined : { from: "/console" };

  return (
    <div className="diya-page">
      <header className="diya-header">
        <div className="diya-container diya-header-inner">
          <Brand />
          <Link className="diya-header-cta" to={workflowHref} state={workflowState}>
            Open workflow<ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className="diya-hero">
          <div className="diya-container diya-hero-grid">
            <div className="diya-hero-copy">
              <div className="diya-eyebrow"><span className="diya-eyebrow-dot" />VOICE AI FOR CUSTOMER OPERATIONS</div>
              <h1>Every call should move a customer <span>forward.</span></h1>
              <p className="diya-hero-lede">
                When an order goes off track, Diya reaches out, listens in the customer&apos;s language,
                and helps make the next step clear.
              </p>
              <div className="diya-hero-actions">
                <Link className="diya-button diya-button-primary" to={workflowHref} state={workflowState}>
                  Open workflow<ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className="diya-text-link" to={operatorHref}>
                  {operatorLabel}<ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className="diya-hero-proof" aria-label="Built for customer support operations">
                <span><Languages size={16} aria-hidden="true" />Hindi, English + Hinglish</span>
                <span><ShieldCheck size={16} aria-hidden="true" />Policy-aware actions</span>
              </div>
            </div>

            <div className="diya-hero-visual">
              <div className="diya-visual-orbit diya-visual-orbit-one" />
              <div className="diya-visual-orbit diya-visual-orbit-two" />
              <div className="diya-visual-caption"><span />A BETTER KIND OF FOLLOW-UP</div>
              <article className="diya-call-card" aria-label="Illustrative sample Diya call">
                <div className="diya-call-card-top">
                  <div className="diya-call-brand-lockup">
                    <span className="diya-call-avatar">d</span>
                    <span><strong>Diya assistant</strong><small>Sample interaction</small></span>
                  </div>
                  <span className="diya-call-live"><i />Illustration</span>
                </div>

                <div className="diya-call-context">
                  <span className="diya-context-icon"><PhoneCall size={16} aria-hidden="true" /></span>
                  <span><small>ORDER FOLLOW-UP</small><strong>Delivery running late</strong></span>
                  <span className="diya-context-time">02:14</span>
                </div>

                <div className="diya-waveform" aria-hidden="true">
                  {waveform.map((height, index) => (
                    <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 24}ms` }} />
                  ))}
                </div>

                <div className="diya-transcript">
                  <div className="diya-transcript-row">
                    <span className="diya-speaker-mark">D</span>
                    <p><b>DIYA</b> Namaste Asha, I&apos;m calling with an update about your order.</p>
                  </div>
                  <div className="diya-transcript-row diya-customer-row">
                    <span className="diya-speaker-mark">A</span>
                    <p><b>CUSTOMER</b> Haan, please tell me.</p>
                  </div>
                </div>

                <div className="diya-call-outcome">
                  <span className="diya-outcome-check"><Check size={15} strokeWidth={2.5} aria-hidden="true" /></span>
                  <span><small>NEXT STEP</small><strong>Share a clear delivery update</strong></span>
                  <span className="diya-outcome-meta"><BadgeCheck size={17} aria-hidden="true" /><small>Policy checked</small></span>
                </div>
              </article>
              <p className="diya-visual-footnote">Illustrative conversation. Actions follow each workspace&apos;s policies.</p>
            </div>
          </div>
        </section>

        <section className="diya-sponsor-showcase" id="sponsors">
          <div className="diya-container">
            <div className="diya-sponsor-heading">
              <div>
                <span className="diya-section-kicker">THE FESTIVE HACKS SPONSOR STACK</span>
                <h2>Three technologies.<br /><span>One complete customer call.</span></h2>
              </div>
              <p>
                Voice in, safe action out. Each sponsor powers a live moment in Diya, from the first spoken word
                to the decision that closes the loop.
              </p>
            </div>

            <div className="diya-sponsor-grid">
              <a className="diya-sponsor-card sponsor-flagsmith" href="https://www.flagsmith.com/" target="_blank" rel="noreferrer">
                <span className="diya-sponsor-index" aria-hidden="true">01</span>
                <span className="diya-sponsor-role">FEATURE CONTROL</span>
                <div className="diya-sponsor-logo-frame"><img src="https://assets-global.website-files.com/64425c978745b453797839bb/64ccd966b5ca5d42866d4cd1_flagsmith-logo.svg" alt="Flagsmith" loading="lazy" decoding="async" /></div>
                <p className="diya-sponsor-card-copy">The right agent, language, and refund limit for every tenant.</p>
                <span className="diya-sponsor-card-foot">Policy controls<ArrowUpRight size={15} aria-hidden="true" /></span>
              </a>
              <a className="diya-sponsor-card sponsor-nudgebee" href="https://nudgebee.com/" target="_blank" rel="noreferrer">
                <span className="diya-sponsor-index" aria-hidden="true">02</span>
                <span className="diya-sponsor-role">HUMAN APPROVALS</span>
                <div className="diya-sponsor-logo-frame"><img src="https://nudgebee.com/assets/images/logo-color.svg" alt="NudgeBee" loading="lazy" decoding="async" /></div>
                <p className="diya-sponsor-card-copy">Sensitive decisions pause for a person, not a guess.</p>
                <span className="diya-sponsor-card-foot">Approval workflows<ArrowUpRight size={15} aria-hidden="true" /></span>
              </a>
              <a className="diya-sponsor-card sponsor-sarvam" href="https://www.sarvam.ai/" target="_blank" rel="noreferrer">
                <span className="diya-sponsor-index" aria-hidden="true">03</span>
                <span className="diya-sponsor-role">VOICE + LANGUAGE AI</span>
                <div className="diya-sponsor-logo-frame"><img src="https://assets.sarvam.ai/assets/brand/logos/sarvam-wordmark-black.svg" alt="Sarvam AI" loading="lazy" decoding="async" /></div>
                <p className="diya-sponsor-card-copy">Hear, reason, and respond in the languages customers use.</p>
                <span className="diya-sponsor-card-foot">Indian-language voice<ArrowUpRight size={15} aria-hidden="true" /></span>
              </a>
            </div>

            <div className="diya-sponsor-caption">
              <span className="diya-sponsor-caption-mark" aria-hidden="true">+</span>
              <span>Built for WeMakeDevs Festive Hacks. Connected end to end in Diya.</span>
            </div>
          </div>
        </section>

        <section className="diya-sponsor-integrations" id="sponsor-integrations">
          <div className="diya-container">
            <div className="diya-integration-heading">
              <span className="diya-section-kicker">THE SPONSOR STACK, INSIDE DIYA</span>
              <h2>From hello to resolution.<br /><span>Every sponsor has a job.</span></h2>
              <p>One call moves through three specialist layers. Each one makes the next decision safer and more useful.</p>
            </div>

            <div className="diya-integration-grid">
              <article className="diya-integration-card integration-sarvam">
                <div className="diya-integration-topline"><span>01 / LISTEN + RESPOND</span><Languages size={17} aria-hidden="true" /></div>
                <div className="diya-integration-logo"><img src="https://assets.sarvam.ai/assets/brand/logos/sarvam-wordmark-black.svg" alt="Sarvam AI" loading="lazy" decoding="async" /></div>
                <h3>The voice engine</h3>
                <p>Sarvam hears the customer, powers the agent's reasoning, and speaks the reply back in a familiar voice.</p>
                <div className="diya-tech-tags"><span>Saaras v3 · STT</span><span>Token Factory · LLM</span><span>Bulbul v3 · TTS</span></div>
              </article>

              <div className="diya-integration-connector" aria-hidden="true"><ArrowRight size={19} /></div>

              <article className="diya-integration-card integration-flagsmith">
                <div className="diya-integration-topline"><span>02 / CHECK THE RULES</span><ShieldCheck size={17} aria-hidden="true" /></div>
                <div className="diya-integration-logo"><img src="https://assets-global.website-files.com/64425c978745b453797839bb/64ccd966b5ca5d42866d4cd1_flagsmith-logo.svg" alt="Flagsmith" loading="lazy" decoding="async" /></div>
                <h3>The policy control plane</h3>
                <p>Flagsmith supplies tenant-scoped controls for the AI switch, refund thresholds, languages, and prompt variants.</p>
                <div className="diya-tech-tags"><span>Server-side flags</span><span>Per-tenant identity</span><span>5-second cache</span></div>
              </article>

              <div className="diya-integration-connector" aria-hidden="true"><ArrowRight size={19} /></div>

              <article className="diya-integration-card integration-nudgebee">
                <div className="diya-integration-topline"><span>03 / BRING IN A HUMAN</span><Headphones size={17} aria-hidden="true" /></div>
                <div className="diya-integration-logo"><img src="https://nudgebee.com/assets/images/logo-color.svg" alt="NudgeBee" loading="lazy" decoding="async" /></div>
                <h3>The approval path</h3>
                <p>When policy requires a person, Diya triggers a NudgeBee workflow and receives the decision through a secret-verified callback.</p>
                <div className="diya-tech-tags"><span>Approval workflow</span><span>Verified callback</span><span>Audited outcome</span></div>
              </article>
            </div>

            <div className="diya-integration-result">
              <span className="diya-result-pulse" />
              <span className="diya-result-label">THE RESULT</span>
              <strong>A customer gets an answer. An operator can see why.</strong>
              <span className="diya-result-end">VOICE <i /> POLICY <i /> ACTION</span>
            </div>
          </div>
        </section>

        <div className="diya-signal-strip" aria-label="Diya product principles">
          <div className="diya-container diya-signal-inner">
            <span>Built for the moments that matter</span>
            <i aria-hidden="true" />
            <span>Consent-first outreach</span>
            <i aria-hidden="true" />
            <span>Clear human handoffs</span>
            <i aria-hidden="true" />
            <span>Every decision accounted for</span>
          </div>
        </div>

        <section className="diya-section diya-use-cases" id="use-cases">
          <div className="diya-container">
            <div className="diya-section-heading diya-section-heading-split">
              <div>
                <span className="diya-section-kicker">CUSTOMER CARE, WITH INITIATIVE</span>
                <h2>Don&apos;t make customers chase an answer.</h2>
              </div>
              <p>Move from reactive queues to thoughtful conversations that begin with context and end with a clear next step.</p>
            </div>

            <div className="diya-use-case-grid">
              <article className="diya-use-card diya-use-card-featured">
                <div className="diya-use-icon"><PhoneCall size={20} aria-hidden="true" /></div>
                <span className="diya-card-index">01 / REACH OUT</span>
                <h3>Start the conversation before frustration starts.</h3>
                <p>When an order needs attention, Diya can place a consented call with the details already in view.</p>
                <a href="#how-it-works" className="diya-card-link">See the call flow<ChevronRight size={16} aria-hidden="true" /></a>
                <div className="diya-featured-decoration" aria-hidden="true"><span /><span /><span /></div>
              </article>
              <article className="diya-use-card">
                <div className="diya-use-icon"><Languages size={20} aria-hidden="true" /></div>
                <span className="diya-card-index">02 / UNDERSTAND</span>
                <h3>Make every customer feel understood.</h3>
                <p>Natural voice conversations in Hindi, English, and Hinglish help people explain the issue their way.</p>
                <a href="#capabilities" className="diya-card-link">Explore capabilities<ChevronRight size={16} aria-hidden="true" /></a>
              </article>
              <article className="diya-use-card">
                <div className="diya-use-icon"><Headphones size={20} aria-hidden="true" /></div>
                <span className="diya-card-index">03 / RESOLVE</span>
                <h3>Know when to act, and when to ask.</h3>
                <p>Routine steps stay within policy. Exceptions move to a person with the context and history intact.</p>
                <a href="#safeguards" className="diya-card-link">See the safeguards<ChevronRight size={16} aria-hidden="true" /></a>
              </article>
            </div>
          </div>
        </section>

        <section className="diya-workflow" id="how-it-works">
          <div className="diya-container">
            <div className="diya-workflow-intro">
              <span className="diya-section-kicker diya-section-kicker-light">FROM FIRST RING TO NEXT STEP</span>
              <h2>A conversation is only useful if it goes somewhere.</h2>
              <p>Diya connects the voice interaction to the operational work around it, so a call is more than a transcript.</p>
            </div>

            <div className="diya-step-grid">
              <article className="diya-step-card">
                <span className="diya-step-number">01</span>
                <div className="diya-step-rule" />
                <h3>Bring the right context</h3>
                <p>Start with the customer&apos;s query, order details, and relevant knowledge, scoped to their workspace.</p>
              </article>
              <article className="diya-step-card">
                <span className="diya-step-number">02</span>
                <div className="diya-step-rule" />
                <h3>Listen and respond naturally</h3>
                <p>Understand speech, clarify what matters, and keep the conversation grounded in the issue at hand.</p>
              </article>
              <article className="diya-step-card">
                <span className="diya-step-number">03</span>
                <div className="diya-step-rule" />
                <h3>Resolve or hand off</h3>
                <p>Check the action against policy, record the outcome, and bring in a human when the case needs judgment.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="diya-section diya-capabilities" id="capabilities">
          <div className="diya-container">
            <div className="diya-section-heading">
              <span className="diya-section-kicker">MORE THAN A VOICE</span>
              <h2>Built around the work behind the conversation.</h2>
              <p>Voice is the interface. Context, policy, and follow-through are what make it useful.</p>
            </div>

            <div className="diya-capability-grid">
              <article className="diya-capability-card">
                <div className="diya-capability-art language-art" aria-hidden="true"><span>नमस्ते</span><span>Hello</span><span>Haan ji</span></div>
                <div className="diya-capability-copy">
                  <Languages size={19} aria-hidden="true" />
                  <h3>Language that feels familiar</h3>
                  <p>Support Hindi and English conversations, including the natural mix customers use every day.</p>
                </div>
              </article>
              <article className="diya-capability-card">
                <div className="diya-capability-art policy-art" aria-hidden="true">
                  <div><Check size={16} />Order verified</div><div><Check size={16} />Policy checked</div><div className="policy-art-muted"><span />Human approval</div>
                </div>
                <div className="diya-capability-copy">
                  <ShieldCheck size={19} aria-hidden="true" />
                  <h3>Actions with guardrails</h3>
                  <p>Apply workspace rules before an action is taken. Send sensitive decisions for human approval.</p>
                </div>
              </article>
              <article className="diya-capability-card">
                <div className="diya-capability-art handoff-art" aria-hidden="true">
                  <div className="handoff-node handoff-node-agent">D</div><div className="handoff-line" /><div className="handoff-node handoff-node-human">H</div>
                  <span>CONTEXT INCLUDED</span>
                </div>
                <div className="diya-capability-copy">
                  <Headphones size={19} aria-hidden="true" />
                  <h3>A human handoff with context</h3>
                  <p>When automation stops, the transcript, issue, and decision trail stay together for the operator.</p>
                </div>
              </article>
              <article className="diya-capability-card">
                <div className="diya-capability-art ops-art" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
                <div className="diya-capability-copy">
                  <LockKeyhole size={19} aria-hidden="true" />
                  <h3>Visibility for the people in charge</h3>
                  <p>Give operators a live view of calls, outcomes, approvals, and the reasons behind each action.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="diya-safeguards" id="safeguards">
          <div className="diya-container diya-safeguards-grid">
            <div className="diya-safeguards-copy">
              <span className="diya-section-kicker diya-section-kicker-light">AUTOMATION, WITH ACCOUNTABILITY</span>
              <h2>Trust is part of the workflow.</h2>
              <p>Customer-facing automation needs clear boundaries. Diya keeps the rules visible and the people accountable.</p>
              <Link to={operatorHref} className="diya-safeguards-link">{operatorLabel}<ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="diya-safeguard-list">
              <article><span><Check size={17} aria-hidden="true" /></span><div><h3>Consent before contact</h3><p>Outbound eligibility depends on recorded customer consent and do-not-call status.</p></div></article>
              <article><span><Check size={17} aria-hidden="true" /></span><div><h3>Rules before action</h3><p>Policy and tenant controls shape what the agent can do during a conversation.</p></div></article>
              <article><span><Check size={17} aria-hidden="true" /></span><div><h3>People for the exceptions</h3><p>Cases outside the safe path can pause for human review instead of guessing.</p></div></article>
              <article><span><Check size={17} aria-hidden="true" /></span><div><h3>A record of what happened</h3><p>Operators can review conversation outcomes and the actions taken along the way.</p></div></article>
            </div>
          </div>
        </section>

        <section className="diya-final-cta">
          <div className="diya-container diya-final-cta-inner">
            <div className="diya-final-cta-mark" aria-hidden="true"><span>d</span><i /><i /><i /></div>
            <span className="diya-section-kicker">A BETTER NEXT STEP STARTS HERE</span>
            <h2>Give every customer call somewhere to go.</h2>
            <p>See how voice, policy, and human judgment can work together in your support operation.</p>
            <div className="diya-final-cta-actions">
              <Link className="diya-button diya-button-primary" to={workflowHref} state={workflowState}>Open workflow<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="diya-text-link" to={operatorHref}>{operatorLabel}<ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="diya-footer" id="about">
        <div className="diya-container diya-footer-inner">
          <Brand />
          <p>Voice operations that keep the human outcome in view.</p>
          <div className="diya-footer-links">
            <a href="#use-cases">Use cases</a>
            <a href="#safeguards">Safeguards</a>
            <Link to={operatorHref}>{operatorLabel}</Link>
          </div>
          <span className="diya-copyright">© 2026 Diya</span>
        </div>
      </footer>
    </div>
  );
}
