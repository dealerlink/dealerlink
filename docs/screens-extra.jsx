// Extra screens for Distribyte: Login, Catalog, Inventory, Order Detail,
// Payments, Dispatch, Reports, Settings. Uses globals from main file:
// Shell, Sidebar, Topbar, Section, Avatar, Chip, Icon, fmtINR, useTweakValues.

const { useState: useStateE, useEffect: useEffectE } = React;

/* ============================================================
   5) LOGIN  — themeable left panel
   Add a new theme by registering it in LOGIN_THEMES below.
   Each theme owns: bg + accents + an Illustration component.
============================================================ */

// — Theme 1: Aurora — flowing abstract blobs + grid (default)
const IllustrationAurora = () => (
  <svg viewBox="0 0 600 800" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="aur-a" cx="0.7" cy="0.25" r="0.7">
        <stop offset="0%" stopColor="#7C6BFF" stopOpacity="0.85"/>
        <stop offset="60%" stopColor="#7C6BFF" stopOpacity="0.18"/>
        <stop offset="100%" stopColor="#7C6BFF" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="aur-b" cx="0.15" cy="0.85" r="0.6">
        <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7"/>
        <stop offset="100%" stopColor="#A78BFA" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="aur-c" cx="0.5" cy="0.55" r="0.5">
        <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.35"/>
        <stop offset="100%" stopColor="#22D3EE" stopOpacity="0"/>
      </radialGradient>
      <pattern id="aur-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="600" height="800" fill="url(#aur-grid)"/>
    <rect width="600" height="800" fill="url(#aur-a)"/>
    <rect width="600" height="800" fill="url(#aur-b)"/>
    <rect width="600" height="800" fill="url(#aur-c)"/>
    {/* floating cards */}
    <g opacity="0.92">
      <rect x="80" y="200" width="180" height="64" rx="10" fill="#fff" fillOpacity="0.06" stroke="rgba(255,255,255,0.18)"/>
      <circle cx="108" cy="232" r="12" fill="#7C6BFF"/>
      <rect x="130" y="222" width="100" height="6" rx="3" fill="rgba(255,255,255,0.5)"/>
      <rect x="130" y="236" width="70" height="5" rx="2.5" fill="rgba(255,255,255,0.25)"/>

      <rect x="320" y="320" width="200" height="84" rx="10" fill="#fff" fillOpacity="0.08" stroke="rgba(255,255,255,0.22)"/>
      <rect x="338" y="338" width="62" height="9" rx="2" fill="rgba(255,255,255,0.6)"/>
      <text x="338" y="380" fill="#fff" fontFamily="ui-sans-serif" fontWeight="600" fontSize="22">+24.8%</text>
      <polyline points="430,388 446,372 460,378 476,358 502,344"
        fill="none" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

      <rect x="120" y="520" width="240" height="56" rx="10" fill="#fff" fillOpacity="0.05" stroke="rgba(255,255,255,0.15)"/>
      <circle cx="148" cy="548" r="10" fill="#22D3EE"/>
      <rect x="166" y="540" width="140" height="6" rx="3" fill="rgba(255,255,255,0.45)"/>
      <rect x="166" y="554" width="86" height="5" rx="2.5" fill="rgba(255,255,255,0.22)"/>
    </g>
  </svg>
);

// — Theme 2: Mesh — isometric workflow nodes
const IllustrationMesh = () => (
  <svg viewBox="0 0 600 800" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="msh-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0F172A"/>
        <stop offset="100%" stopColor="#3730A3"/>
      </linearGradient>
      <pattern id="msh-dots" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.12)"/>
      </pattern>
    </defs>
    <rect width="600" height="800" fill="url(#msh-bg)"/>
    <rect width="600" height="800" fill="url(#msh-dots)"/>
    {/* connecting lines */}
    <g stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" fill="none">
      <path d="M150 220 Q 280 260 380 200"/>
      <path d="M380 200 Q 460 320 420 460"/>
      <path d="M150 220 Q 200 400 250 540"/>
      <path d="M250 540 Q 360 540 420 460"/>
    </g>
    {/* nodes */}
    {[
      [150,220,"#7C6BFF"], [380,200,"#22D3EE"], [420,460,"#A78BFA"], [250,540,"#7C6BFF"]
    ].map(([x,y,c],i)=>(
      <g key={i}>
        <circle cx={x} cy={y} r="18" fill={c} fillOpacity="0.25"/>
        <circle cx={x} cy={y} r="8" fill={c}/>
      </g>
    ))}
  </svg>
);

// — Theme 3: Paper — quiet editorial mode
const IllustrationPaper = () => (
  <svg viewBox="0 0 600 800" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="ppr-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F5F1E8"/>
        <stop offset="100%" stopColor="#E9E3D2"/>
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#ppr-bg)"/>
    <circle cx="450" cy="220" r="160" fill="#3730A3" fillOpacity="0.08"/>
    <circle cx="180" cy="560" r="120" fill="#3730A3" fillOpacity="0.06"/>
    {/* concentric rings */}
    <g fill="none" stroke="#3730A3" strokeOpacity="0.18">
      <circle cx="300" cy="400" r="80"/>
      <circle cx="300" cy="400" r="140"/>
      <circle cx="300" cy="400" r="220"/>
    </g>
    <circle cx="300" cy="400" r="20" fill="#3730A3"/>
  </svg>
);

const LOGIN_THEMES = {
  aurora: {
    name:"Aurora",
    bg:"#0B0F1A",
    text:"text-white",
    eyebrow:"text-white/60",
    body:"text-white/70",
    chipBg:"bg-white/10",
    metricBg:"bg-[#0B0F1A]",
    metricLbl:"text-white/55",
    Illustration: IllustrationAurora,
  },
  mesh: {
    name:"Mesh",
    bg:"#0F172A",
    text:"text-white",
    eyebrow:"text-white/60",
    body:"text-white/70",
    chipBg:"bg-white/10",
    metricBg:"bg-[#0F172A]",
    metricLbl:"text-white/55",
    Illustration: IllustrationMesh,
  },
  paper: {
    name:"Paper",
    bg:"#F5F1E8",
    text:"text-[#0B0F1A]",
    eyebrow:"text-[#6B7280]",
    body:"text-[#3F3F38]",
    chipBg:"bg-[#0B0F1A]/8",
    metricBg:"bg-[#F5F1E8]",
    metricLbl:"text-[#6B7280]",
    Illustration: IllustrationPaper,
  },
};

const Login = () => {
  const tweaks = useTweakValues();
  const themeKey = (tweaks && tweaks.loginTheme) || "aurora";
  const theme = LOGIN_THEMES[themeKey] || LOGIN_THEMES.aurora;
  const Illo = theme.Illustration;
  return (
    <div className="grid grid-cols-2 h-full" style={{background:theme.bg}}>
      {/* left brand panel */}
      <div className={`relative overflow-hidden p-10 flex flex-col ${theme.text}`}>
        <Illo/>

        <div className="relative flex items-center gap-2.5">
          <div className={`relative h-[28px] w-[28px] rounded-[6px] ${themeKey==='paper'?'bg-[#0B0F1A]':'bg-white'}`}></div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{tweaks?.company || 'Distribyte'}</span>
        </div>

        <div className="relative mt-auto">
          <div className={`titlecaps !${theme.eyebrow}`}>The operating console</div>
          <h2 className="font-[Instrument_Serif] italic text-[56px] leading-[1] mt-3 max-w-[460px]" style={{fontFamily:"'Instrument Serif',serif",fontStyle:"italic"}}>
            One system of record for every transaction.
          </h2>
          <p className={`text-[14px] mt-4 max-w-[420px] leading-relaxed ${theme.body}`}>
            Pipeline, inventory, paperwork, and payments — for distributors who'd rather close the day than chase it.
          </p>

          {/* mini metric strip */}
          <div className={`grid grid-cols-3 gap-px ${theme.chipBg} mt-8 rounded-[8px] overflow-hidden max-w-[480px]`}>
            {[
              {l:"Tenants live",   v:"142"},
              {l:"Orders · YTD",   v:"38.4K"},
              {l:"Volume processed",v:"₹612 Cr"},
            ].map(m=>(
              <div key={m.l} className={`${theme.metricBg} p-4`}>
                <div className="num text-[22px] font-semibold tracking-[-0.02em]">{m.v}</div>
                <div className={`text-[10.5px] uppercase tracking-[0.1em] mt-1 ${theme.metricLbl}`}>{m.l}</div>
              </div>
            ))}
          </div>

          <div className={`mt-10 flex items-center gap-3 text-[11.5px] mono ${theme.metricLbl}`}>
            <span>SOC-2 type II</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-50"></span>
            <span>ISO 27001</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-50"></span>
            <span>Hosted in Mumbai · ap-south-1</span>
          </div>
        </div>
      </div>

      {/* right form */}
      <div className="bg-[#F7F7F4] flex flex-col">
        <div className="flex justify-end p-5 gap-2 text-[12px] text-[#6B7280]">
          <span>New here?</span>
          <a className="text-[#3730A3] font-medium hover:underline">Request a demo →</a>
        </div>
        <div className="flex-1 flex items-center justify-center px-12">
          <div className="w-[400px]">
            <div className="titlecaps">Sign in to your tenant</div>
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] mt-2">
              Welcome back. <span className="serif-i text-[#6B7280] font-normal">Pick up where you left off.</span>
            </h1>

            <div className="mt-7 flex flex-col gap-3.5">
              <div>
                <label className="text-[11.5px] text-[#6B7280] mono uppercase tracking-[0.06em]">Tenant</label>
                <div className="hairline rounded-[6px] bg-white mt-1 flex items-center h-[42px] px-3 gap-2">
                  <Icon name="building-2" size={14} className="text-[#6B7280]"/>
                  <input defaultValue="mittal-distributors" className="flex-1 text-[13px] bg-transparent outline-none mono"/>
                  <span className="text-[11px] text-[#94928A] mono">.distribyte.io</span>
                </div>
              </div>
              <div>
                <label className="text-[11.5px] text-[#6B7280] mono uppercase tracking-[0.06em]">Email</label>
                <div className="hairline rounded-[6px] bg-white mt-1 flex items-center h-[42px] px-3 gap-2">
                  <Icon name="at-sign" size={14} className="text-[#6B7280]"/>
                  <input defaultValue="akshay@mittal-distributors.in" className="flex-1 text-[13px] bg-transparent outline-none"/>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] text-[#6B7280] mono uppercase tracking-[0.06em]">Password</label>
                  <a className="text-[11.5px] text-[#3730A3] hover:underline">Forgot?</a>
                </div>
                <div className="hairline rounded-[6px] bg-white mt-1 flex items-center h-[42px] px-3 gap-2">
                  <Icon name="lock" size={14} className="text-[#6B7280]"/>
                  <input type="password" defaultValue="••••••••••" className="flex-1 text-[13px] bg-transparent outline-none mono"/>
                  <button className="icon-btn"><Icon name="eye" size={13}/></button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12.5px] text-[#1A2030] mt-1">
                <input type="checkbox" defaultChecked className="rounded-[3px] border-[#D5D5CC] text-[#0B0F1A] focus:ring-0"/>
                Remember this device for 14 days
              </label>

              <button className="btn btn-pri h-[44px] mt-2 justify-center text-[13.5px]">
                Continue <Icon name="arrow-right" size={14}/>
              </button>

              <div className="flex items-center gap-3 my-1 text-[11px] text-[#94928A] uppercase tracking-[0.1em]">
                <span className="flex-1 h-px bg-[#E3E3DC]"></span>
                or
                <span className="flex-1 h-px bg-[#E3E3DC]"></span>
              </div>

              <button className="btn h-[42px] justify-center">
                <Icon name="key-round" size={14}/> Sign in with SAML SSO
              </button>
            </div>

            <div className="mt-8 text-[11.5px] text-[#94928A] mono">
              Last login · 05 May 2026, 18:42 IST · 103.27.182.44 · Mumbai
            </div>
          </div>
        </div>
        <div className="px-12 py-4 hairline-t flex items-center justify-between text-[11px] text-[#94928A] mono">
          <span>© 2026 Distribyte Technologies</span>
          <div className="flex gap-4">
            <a>Privacy</a><a>Terms</a><a>Status · operational</a>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   6) PRODUCT CATALOG
============================================================ */
const PRODUCTS = [
  {sku:"PRM-610-NDCR", mfr:"Premier Energies", model:"610 Wp NDCR TOPCON", tech:"TOPCon", w:610, price:"18,900", mrp:"22,400", stock:1240, low:false, hot:true},
  {sku:"PRM-540-MONO", mfr:"Premier Energies", model:"540 Wp Mono Half-cut", tech:"Mono",   w:540, price:"14,600", mrp:"17,200", stock:860,  low:false},
  {sku:"PRM-580-NTYPE",mfr:"Premier Energies", model:"580 Wp N-Type Bifacial", tech:"N-Type", w:580, price:"17,200", mrp:"20,100", stock:42,   low:true},
  {sku:"ADN-580-BIF",  mfr:"Adani Solar",      model:"580 Wp Bifacial Glass", tech:"Bifacial", w:580, price:"17,800", mrp:"21,000", stock:610,  low:false},
  {sku:"VKR-600-TOP",  mfr:"Vikram Solar",     model:"600 Wp TOPCon Hi-Eff",  tech:"TOPCon", w:600, price:"18,200", mrp:"21,800", stock:380,  low:false},
  {sku:"ADN-540-MONO", mfr:"Adani Solar",      model:"540 Wp Mono PERC",      tech:"Mono", w:540, price:"14,200", mrp:"16,900", stock:0,    low:true, oos:true},
  {sku:"WAR-555-MONO", mfr:"Waaree",           model:"555 Wp Mono Half-cut",  tech:"Mono", w:555, price:"14,800", mrp:"17,400", stock:520,  low:false},
  {sku:"REC-410-ALPHA",mfr:"REC",              model:"410 Wp Alpha Pure-R",   tech:"N-Type", w:410, price:"22,400", mrp:"26,800", stock:96,   low:true},
];

const ProductCard = ({p}) => (
  <article className="bg-white hairline rounded-[8px] overflow-hidden group hover:shadow-[0_12px_30px_-12px_rgba(11,15,26,0.16)] transition flex flex-col">
    {/* image area placeholder */}
    <div className="aspect-[4/3] relative ticked bg-[#F0F0E9] hairline-b">
      <div className="absolute inset-3 border border-dashed border-[#D5D5CC] rounded-[6px] flex items-center justify-center">
        <div className="text-center">
          <Icon name="image" size={20} className="text-[#9CA3AF] mx-auto"/>
          <div className="text-[10px] mono text-[#94928A] mt-1.5 uppercase tracking-[0.08em]">{p.tech} · {p.w}W</div>
        </div>
      </div>
      <div className="absolute top-2.5 left-2.5">
        <span className="text-[10px] mono uppercase tracking-[0.08em] bg-white hairline rounded-[3px] px-1.5 py-0.5">{p.mfr}</span>
      </div>
      {p.hot && <span className="absolute top-2.5 right-2.5"><Chip tone="ro" dot>fast-mover</Chip></span>}
      {p.oos && <span className="absolute top-2.5 right-2.5"><Chip tone="mu">out of stock</Chip></span>}
    </div>
    <div className="p-3.5 flex-1 flex flex-col">
      <div className="text-[11px] mono text-[#94928A]">{p.sku}</div>
      <h4 className="text-[13.5px] font-semibold tracking-[-0.005em] mt-0.5 leading-snug">{p.model}</h4>
      <div className="flex items-baseline justify-between mt-3">
        <div>
          <div className="num text-[18px] font-semibold tracking-[-0.01em]">₹{p.price}</div>
          <div className="text-[10.5px] text-[#94928A] mono">MRP ₹{p.mrp}</div>
        </div>
        <div className="text-right">
          <div className={`num text-[12px] font-medium ${p.oos?'text-[#B91C1C]':p.low?'text-[#B45309]':'text-[#047857]'}`}>{p.oos?'0':p.stock} <span className="text-[#94928A]">in stock</span></div>
          {p.low && !p.oos && <div className="text-[10px] text-[#B45309] mono mt-0.5">↓ low stock</div>}
        </div>
      </div>
      <div className="hairline-t mt-3 pt-2.5 flex items-center gap-1">
        <button className="btn btn-sm flex-1 justify-center"><Icon name="file-plus" size={12}/> Add to quote</button>
        <button className="icon-btn"><Icon name="more-horizontal" size={14}/></button>
      </div>
    </div>
  </article>
);

const Catalog = () => {
  const tweaks = useTweakValues();
  return (
  <Shell active="prod" crumbs={[tweaks.company,"Catalog"]}
    topRight={
      <div className="flex items-center gap-2">
        <button className="btn btn-sm"><Icon name="upload" size={13}/> Sync from manufacturer</button>
        <button className="btn btn-sm btn-pri"><Icon name="plus" size={13}/> New product</button>
      </div>
    }>
    <div className="h-full flex">
      {/* left filter rail */}
      <aside className="w-[240px] hairline-r bg-white flex flex-col p-5 overflow-auto">
        <div className="hairline rounded-[6px] flex items-center h-[34px] px-3 gap-2">
          <Icon name="search" size={13} className="text-[#6B7280]"/>
          <input placeholder="Filter catalog" className="flex-1 text-[12.5px] bg-transparent outline-none"/>
        </div>
        <div className="mt-5">
          <div className="titlecaps">Manufacturer</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
            {[["Premier Energies",24,true],["Adani Solar",18,true],["Vikram Solar",12,false],["Waaree",16,false],["REC",10,false],["Tata Power",6,false]].map(([m,c,on])=>(
              <li key={m} className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={on} className="rounded-[3px] border-[#D5D5CC] focus:ring-0"/>
                <span className="flex-1">{m}</span>
                <span className="mono text-[11px] text-[#94928A]">{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5">
          <div className="titlecaps">Technology</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
            {["TOPCon","Mono","N-Type","Bifacial","Poly"].map(t=>(
              <li key={t} className="flex items-center gap-2"><input type="checkbox" defaultChecked={["TOPCon","Mono"].includes(t)} className="rounded-[3px] border-[#D5D5CC] focus:ring-0"/><span>{t}</span></li>
            ))}
          </ul>
        </div>
        <div className="mt-5">
          <div className="titlecaps">Wattage</div>
          <div className="mt-3 mono text-[11px] text-[#6B7280] flex justify-between"><span>400W</span><span>610W</span></div>
          <div className="mt-1 h-[3px] bg-[#E3E3DC] rounded-full relative">
            <div className="absolute h-full bg-[#0B0F1A] rounded-full" style={{left:"30%",right:"5%"}}></div>
            <div className="absolute -top-1 w-[10px] h-[10px] rounded-full bg-white border border-[#0B0F1A]" style={{left:"30%"}}></div>
            <div className="absolute -top-1 w-[10px] h-[10px] rounded-full bg-white border border-[#0B0F1A]" style={{right:"5%"}}></div>
          </div>
          <div className="mt-2 mono text-[11px] text-[#1A2030]">540W → 600W</div>
        </div>
        <div className="mt-5">
          <div className="titlecaps">Stock status</div>
          <div className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="rounded-[3px] border-[#D5D5CC]"/><span className="dot s-em"></span>In stock</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="rounded-[3px] border-[#D5D5CC]"/><span className="dot s-am"></span>Low stock</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="rounded-[3px] border-[#D5D5CC]"/><span className="dot s-mu"></span>Out of stock</label>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="px-7 pt-6 pb-4 flex items-end justify-between">
          <div>
            <div className="titlecaps">Catalog · 86 products</div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
              Solar panels <span className="serif-i text-[#6B7280] font-normal">across six manufacturers</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#6B7280]">Sort</span>
            <div className="chip">Best-sellers <Icon name="chevron-down" size={12}/></div>
            <div className="hairline rounded-[6px] flex">
              <button className="icon-btn !bg-[#0B0F1A] !text-white !rounded-[6px]"><Icon name="layout-grid" size={14}/></button>
              <button className="icon-btn"><Icon name="list" size={14}/></button>
            </div>
          </div>
        </div>
        <div className="px-7 pb-7 grid grid-cols-3 gap-3.5">
          {PRODUCTS.map(p=><ProductCard key={p.sku} p={p}/>)}
        </div>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   7) INVENTORY
============================================================ */
const SERIALS = [
  {sn:"PRM610-2025-08-1142", prod:"Premier 610 Wp NDCR", proc:"08 Aug 2025", status:"In Stock",   res:"—",                  wh:"WH-01 Bhiwandi"},
  {sn:"PRM610-2025-08-1143", prod:"Premier 610 Wp NDCR", proc:"08 Aug 2025", status:"Reserved",   res:"ORD-2611 · Uma Trd", wh:"WH-01 Bhiwandi"},
  {sn:"PRM610-2025-08-1144", prod:"Premier 610 Wp NDCR", proc:"08 Aug 2025", status:"Reserved",   res:"ORD-2611 · Uma Trd", wh:"WH-01 Bhiwandi"},
  {sn:"PRM540-2025-09-2210", prod:"Premier 540 Wp Mono", proc:"22 Sep 2025", status:"Dispatched", res:"ORD-2598 · Green PE", wh:"WH-02 Hosur"},
  {sn:"ADN580-2025-10-0118", prod:"Adani 580 Wp Bifac.", proc:"06 Oct 2025", status:"Delivered",  res:"ORD-2541 · Sunfield",wh:"WH-02 Hosur"},
  {sn:"PRM610-2025-08-1145", prod:"Premier 610 Wp NDCR", proc:"08 Aug 2025", status:"In Stock",   res:"—",                  wh:"WH-01 Bhiwandi"},
  {sn:"VKR600-2025-11-0042", prod:"Vikram 600 Wp TOPCon",proc:"19 Nov 2025", status:"In Stock",   res:"—",                  wh:"WH-03 Pune"},
  {sn:"PRM580-2025-12-0301", prod:"Premier 580 Wp N-Type",proc:"04 Dec 2025",status:"Reserved",   res:"ORD-2614 · Helios",  wh:"WH-01 Bhiwandi"},
  {sn:"WAR555-2026-01-0012", prod:"Waaree 555 Wp Mono",  proc:"08 Jan 2026", status:"In Stock",   res:"—",                  wh:"WH-03 Pune"},
  {sn:"PRM610-2025-08-1146", prod:"Premier 610 Wp NDCR", proc:"08 Aug 2025", status:"In Stock",   res:"—",                  wh:"WH-01 Bhiwandi"},
];

const StatusPill = ({s}) => {
  const map = {"In Stock":"em","Reserved":"in","Dispatched":"am","Delivered":"mu"};
  return <Chip tone={map[s]} dot>{s}</Chip>;
};

const Inventory = () => {
  const tweaks = useTweakValues();
  const [tab, setTab] = useStateE("All");
  return (
  <Shell active="inv" crumbs={[tweaks.company,"Inventory"]}
    topRight={
      <div className="flex items-center gap-2">
        <button className="btn btn-sm"><Icon name="qr-code" size={13}/> Scan serial</button>
        <button className="btn btn-sm"><Icon name="upload" size={13}/> Bulk import</button>
        <button className="btn btn-sm btn-pri"><Icon name="package-plus" size={13}/> Receive stock</button>
      </div>
    }>
    <div className="h-full flex flex-col">
      <div className="px-7 pt-6 pb-4 hairline-b bg-[#FBFBF8]">
        <div className="flex items-end justify-between">
          <div>
            <div className="titlecaps">Inventory · serial-tracked</div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
              4,812 panels <span className="serif-i text-[#6B7280] font-normal">across three warehouses</span>
            </h1>
          </div>
          {/* prominent serial search */}
          <div className="hairline bg-white rounded-[8px] flex items-center h-[44px] pl-3.5 pr-2 gap-2 w-[420px] shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            <Icon name="scan-search" size={16} className="text-[#3730A3]"/>
            <input placeholder="Find by serial number — e.g. PRM610-2025-08-1143" className="flex-1 text-[13px] bg-transparent outline-none mono placeholder:text-[#94928A]"/>
            <span className="kbd">⌘K</span>
            <button className="btn btn-sm btn-pri">Trace</button>
          </div>
        </div>

        {/* stat strip */}
        <div className="mt-5 grid grid-cols-5 gap-px bg-[#E3E3DC] hairline rounded-[8px] overflow-hidden">
          {[
            {l:"Total units",     v:"4,812", sub:"6 SKUs"},
            {l:"In stock",        v:"3,418", sub:"71% available", tone:"em"},
            {l:"Reserved",        v:"892",   sub:"34 orders", tone:"in"},
            {l:"Dispatched · MTD",v:"412",   sub:"+18% vs LM"},
            {l:"Low stock alerts",v:"3",     sub:"SKUs below threshold", tone:"am"},
          ].map(s=>(
            <div key={s.l} className="bg-white p-4">
              <div className="titlecaps">{s.l}</div>
              <div className={`num text-[24px] font-semibold tracking-[-0.02em] mt-1 ${s.tone==="em"?"text-[#047857]":s.tone==="am"?"text-[#B45309]":s.tone==="in"?"text-[#3730A3]":""}`}>{s.v}</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div className="px-7 hairline-b flex items-center gap-1">
        {["All","In Stock","Reserved","Dispatched","Delivered"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-3 h-[42px] text-[12.5px] border-b-2 ${tab===t?"border-[#0B0F1A] text-[#0B0F1A] font-medium":"border-transparent text-[#6B7280]"}`}>
            {t} <span className="mono text-[10.5px] text-[#94928A] ml-1">{({"All":4812,"In Stock":3418,"Reserved":892,"Dispatched":412,"Delivered":90})[t]}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 py-2">
          <div className="chip"><Icon name="warehouse" size={12}/> All warehouses <Icon name="chevron-down" size={12}/></div>
          <div className="chip"><Icon name="calendar" size={12}/> Procured: any <Icon name="chevron-down" size={12}/></div>
          <button className="icon-btn"><Icon name="download" size={14}/></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="table-head">
              <th className="text-left font-medium px-5 py-3 w-[34px]"><input type="checkbox" className="rounded-[3px]"/></th>
              <th className="text-left font-medium py-3">Serial number</th>
              <th className="text-left font-medium py-3">Product</th>
              <th className="text-left font-medium py-3">Procured</th>
              <th className="text-left font-medium py-3">Status</th>
              <th className="text-left font-medium py-3">Reserved for</th>
              <th className="text-left font-medium py-3">Warehouse</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {SERIALS.map((s,i)=>(
              <tr key={i} className="row hairline-b row-h">
                <td className="px-5"><input type="checkbox" className="rounded-[3px]"/></td>
                <td className="mono text-[12px] font-medium">{s.sn}</td>
                <td>{s.prod}</td>
                <td className="mono text-[12px] text-[#1A2030]">{s.proc}</td>
                <td><StatusPill s={s.status}/></td>
                <td className="text-[12.5px] text-[#1A2030]">{s.res}</td>
                <td className="text-[12.5px]">{s.wh}</td>
                <td><button className="icon-btn"><Icon name="more-horizontal" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   8) ORDER DETAIL
============================================================ */
const Order = () => {
  const tweaks = useTweakValues();
  const stages = ["Lead","Requirement","Quotation","Negotiation","Confirmed","Payment","Ready","Dispatched","Closed"];
  const current = 7; // Dispatched
  return (
  <Shell active="ord" crumbs={[tweaks.company,"Orders","ORD-2611"]}
    topRight={
      <div className="flex items-center gap-2">
        <button className="btn btn-sm"><Icon name="printer" size={13}/> Print</button>
        <button className="btn btn-sm"><Icon name="file-text" size={13}/> Tax invoice</button>
        <button className="btn btn-sm btn-acc"><Icon name="check-circle-2" size={13}/> Mark delivered</button>
      </div>
    }>
    <div className="h-full overflow-auto">
      <div className="px-7 pt-6 pb-5 hairline-b bg-[#FBFBF8]">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 titlecaps">
              <span>Order</span>
              <span className="mono text-[#94928A]">ORD-2611</span>
              <Chip tone="em" dot>Paid in full</Chip>
              <Chip tone="am" dot>Dispatched · awaiting POD</Chip>
            </div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] mt-1">
              Uma Trading Co <span className="serif-i text-[#6B7280] font-normal">— Mumbai · 760 panels</span>
            </h1>
            <div className="mt-1 text-[12.5px] text-[#6B7280] mono">Confirmed 28 Apr 2026 · Expected delivery 09 May 2026</div>
          </div>
          <div className="text-right">
            <div className="titlecaps">Order value</div>
            <div className="num text-[30px] font-semibold tracking-[-0.02em]">₹47,80,448</div>
            <div className="mono text-[11.5px] text-[#047857] mt-0.5">Reconciled · UTR HDFC**4128 · 28 Apr</div>
          </div>
        </div>

        {/* timeline */}
        <div className="mt-6 flex items-center gap-0">
          {stages.map((s,i)=>(
            <React.Fragment key={s}>
              <div className="flex flex-col items-center" style={{minWidth:78}}>
                <div className={`w-[20px] h-[20px] rounded-full flex items-center justify-center ${i<=current?"bg-[#0B0F1A] text-white":"bg-white hairline text-[#94928A]"}`}>
                  {i<current ? <Icon name="check" size={11}/> : i===current ? <span className="w-[6px] h-[6px] rounded-full bg-white"></span> : <span className="mono text-[10px]">{i+1}</span>}
                </div>
                <div className={`text-[11px] mt-2 ${i===current?"text-[#0B0F1A] font-semibold":"text-[#6B7280]"}`}>{s}</div>
                {i<=current && <div className="mono text-[10px] text-[#94928A] mt-0.5">{["12 Apr","16 Apr","18 Apr","22 Apr","24 Apr","28 Apr","02 May","04 May","—"][i]}</div>}
              </div>
              {i<stages.length-1 && <div className={`flex-1 h-px ${i<current?"bg-[#0B0F1A]":"bg-[#E3E3DC]"}`}></div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="px-7 hairline-b flex items-center gap-5 text-[12.5px] bg-white">
        {["Line items","Payments","Dispatch","Invoice","Activity"].map((t,i)=>(
          <button key={t} className={`py-3 ${i===0?"text-[#0B0F1A] border-b-2 border-[#0B0F1A] font-medium":"text-[#6B7280]"}`}>
            {t}{i===0 && <span className="ml-1 mono text-[10.5px] text-[#94928A]">3</span>}
            {i===1 && <span className="ml-1 mono text-[10.5px] text-[#94928A]">2</span>}
            {i===2 && <span className="ml-1 mono text-[10.5px] text-[#94928A]">1</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-5 px-7 py-6">
        <div className="col-span-8 flex flex-col gap-4">
          {/* line items */}
          <Section eyebrow="Line items" title="3 products · 760 units · ₹40,53,098 taxable">
            <table className="w-full text-[12.5px]">
              <thead><tr className="table-head">
                <th className="text-left font-medium pl-5 py-2.5 w-[8px]">#</th>
                <th className="text-left font-medium py-2.5">Product</th>
                <th className="text-right font-medium py-2.5">Qty</th>
                <th className="text-right font-medium py-2.5">Rate</th>
                <th className="text-right font-medium py-2.5">Reserved</th>
                <th className="text-right font-medium py-2.5 pr-5">Line total</th>
              </tr></thead>
              <tbody>
                {[
                  {s:"PRM-610-NDCR", m:"Premier 610 Wp NDCR TOPCON", q:600, r:"18,900", res:"600 / 600", lt:"1,13,40,000"},
                  {s:"PRM-540-MONO", m:"Premier 540 Wp Mono Half-cut",q:120, r:"14,600", res:"120 / 120", lt:"17,52,000"},
                  {s:"ADN-580-BIF",  m:"Adani 580 Wp Bifacial Glass", q: 40, r:"17,800", res:" 40 /  40", lt:"7,12,000"},
                ].map((l,i)=>(
                  <tr key={i} className="hairline-b">
                    <td className="pl-5 py-3 mono text-[11px] text-[#94928A]">{String(i+1).padStart(2,'0')}</td>
                    <td className="py-3"><div className="font-medium">{l.m}</div><div className="mono text-[11px] text-[#6B7280] mt-0.5">{l.s}</div></td>
                    <td className="num text-right font-medium">{l.q}</td>
                    <td className="num text-right">₹{l.r}</td>
                    <td className="num text-right text-[#047857]">{l.res}</td>
                    <td className="num text-right pr-5 font-semibold">₹{l.lt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hairline-t bg-[#FBFBF8] px-5 py-3 grid grid-cols-4 gap-4 text-[12.5px]">
              <div><div className="text-[#6B7280]">Taxable</div><div className="num font-medium">₹40,53,098</div></div>
              <div><div className="text-[#6B7280]">IGST · 12%</div><div className="num font-medium">₹4,86,372</div></div>
              <div><div className="text-[#6B7280]">Round-off</div><div className="num font-medium">−₹0.78</div></div>
              <div className="text-right"><div className="text-[#6B7280]">Grand total</div><div className="num text-[18px] font-semibold">₹45,39,469</div></div>
            </div>
          </Section>

          {/* dispatch box */}
          <Section eyebrow="Dispatch" title="LR MH-12-DR-7740 · Driver Suresh K."
            right={<Chip tone="am" dot>In transit</Chip>}>
            <div className="grid grid-cols-3 gap-px bg-[#E3E3DC] hairline-t">
              <div className="bg-white p-4">
                <div className="titlecaps">LR / consignment</div>
                <div className="mono text-[14px] mt-1">MH-12-DR-7740</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5">VRL Logistics · Bhiwandi → BKC</div>
              </div>
              <div className="bg-white p-4">
                <div className="titlecaps">Vehicle</div>
                <div className="mono text-[14px] mt-1">MH-04-FL-2241</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5">Tata Prima 3128 · 25 ton</div>
              </div>
              <div className="bg-white p-4">
                <div className="titlecaps">Driver</div>
                <div className="text-[14px] mt-1">Suresh Kadam</div>
                <div className="mono text-[11.5px] text-[#6B7280] mt-0.5">+91 98220 41882 · DL MH-04 8821129</div>
              </div>
            </div>
          </Section>
        </div>

        <div className="col-span-4 flex flex-col gap-4">
          <Section eyebrow="Dealer" title="Uma Trading Co">
            <div className="px-5 py-4 text-[12.5px] flex flex-col gap-2">
              <div className="flex items-center gap-2"><Icon name="map-pin" size={12} className="text-[#6B7280]"/> 14, MIDC, Andheri (E), Mumbai 400093</div>
              <div className="flex items-center gap-2"><Icon name="phone" size={12} className="text-[#6B7280]"/> Vikrant Shah · +91 98201 41882</div>
              <div className="flex items-center gap-2"><Icon name="hash" size={12} className="text-[#6B7280]"/> <span className="mono">27AABCU9603R1ZM</span></div>
              <div className="hairline-t mt-2 pt-3 grid grid-cols-2 gap-3">
                <div><div className="titlecaps">Lifetime</div><div className="num text-[15px] font-semibold">₹47.80 L</div></div>
                <div><div className="titlecaps">Open orders</div><div className="num text-[15px] font-semibold">8</div></div>
              </div>
            </div>
          </Section>

          <Section eyebrow="Payments" title="₹45,39,469 received · 2 of 2"
            right={<button className="btn btn-sm"><Icon name="plus" size={12}/></button>}>
            <ul className="text-[12.5px]">
              {[
                {d:"22 Apr 2026", v:"13,61,841",  m:"Advance · 30%", utr:"HDFC**4128"},
                {d:"28 Apr 2026", v:"31,77,628",  m:"Balance · 70%",  utr:"HDFC**4128"},
              ].map((p,i)=>(
                <li key={i} className="flex items-center px-5 h-[48px] hairline-b last:border-0">
                  <div className="flex-1">
                    <div className="font-medium">{p.m}</div>
                    <div className="mono text-[10.5px] text-[#6B7280] mt-0.5">{p.d} · UTR {p.utr}</div>
                  </div>
                  <div className="num font-semibold text-[#047857]">₹{p.v}</div>
                </li>
              ))}
            </ul>
          </Section>

          <Section eyebrow="Activity" title="Recent">
            <ul className="px-5 py-3 text-[12px] flex flex-col gap-2.5">
              <li className="flex gap-2"><span className="mono text-[10.5px] text-[#94928A] w-[44px]">04 May</span><span>Dispatch confirmed by D. Verma · LR generated</span></li>
              <li className="flex gap-2"><span className="mono text-[10.5px] text-[#94928A] w-[44px]">04 May</span><span>Tax invoice TI-1108 generated · ₹45,39,469</span></li>
              <li className="flex gap-2"><span className="mono text-[10.5px] text-[#94928A] w-[44px]">02 May</span><span>760 serials reserved (FIFO · WH-01 Bhiwandi)</span></li>
              <li className="flex gap-2"><span className="mono text-[10.5px] text-[#94928A] w-[44px]">28 Apr</span><span>Payment ₹31,77,628 reconciled · A. Kapoor</span></li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   9) PAYMENTS
============================================================ */
const AGING = [
  {b:"0–30 days",  v:"86.40 L", c:18, w:60, tone:"em"},
  {b:"31–60 days", v:"42.10 L", c: 9, w:32, tone:"am"},
  {b:"61–90 days", v:"38.20 L", c: 6, w:28, tone:"am"},
  {b:"90+ days",   v:"17.30 L", c: 4, w:14, tone:"ro"},
];
const OVERDUE = [
  {dealer:"Green Power EPC",  ord:"ORD-2598", v:"14,82,000", days:14, last:"02 May",  tone:"ro"},
  {dealer:"Veer Renewables",  ord:"ORD-2541", v:"6,40,000",  days: 8, last:"01 May",  tone:"am"},
  {dealer:"Helios Renewables",ord:"ORD-2614", v:"7,80,000",  days:18, last:"28 Apr",  tone:"ro"},
  {dealer:"Aarav Energy",     ord:"ORD-2487", v:"3,20,000",  days:42, last:"22 Apr",  tone:"ro"},
  {dealer:"Bharat Power Tr.", ord:"ORD-2399", v:"2,10,000",  days:96, last:"19 Mar",  tone:"ro"},
  {dealer:"Volt Mart",        ord:"ORD-2521", v:"4,80,000",  days: 4, last:"02 May",  tone:"am"},
];

const Payments = () => {
  const tweaks = useTweakValues();
  return (
  <Shell active="pay" crumbs={[tweaks.company,"Payments"]}
    topRight={
      <div className="flex items-center gap-2">
        <button className="btn btn-sm"><Icon name="download" size={13}/> Aging report</button>
        <button className="btn btn-sm btn-pri"><Icon name="banknote" size={13}/> Record payment</button>
      </div>
    }>
    <div className="h-full overflow-auto">
      <div className="px-7 pt-6 pb-5 hairline-b">
        <div className="flex items-end justify-between">
          <div>
            <div className="titlecaps">Receivables · 11 dealers</div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
              ₹1,84,00,000 outstanding <span className="serif-i text-[#6B7280] font-normal">across 37 invoices</span>
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <div><div className="titlecaps">Reconciled · MTD</div><div className="num text-[16px] font-semibold mt-0.5 text-[#047857]">₹2.42 Cr</div></div>
            <div><div className="titlecaps">Avg days to pay</div><div className="num text-[16px] font-semibold mt-0.5">28d</div></div>
          </div>
        </div>

        {/* aging chart */}
        <div className="mt-6 grid grid-cols-4 gap-px bg-[#E3E3DC] hairline rounded-[8px] overflow-hidden">
          {AGING.map(a=>(
            <div key={a.b} className="bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="titlecaps">{a.b}</div>
                <Chip tone={a.tone} dot>{a.c}</Chip>
              </div>
              <div className="num text-[24px] font-semibold tracking-[-0.02em] mt-2">₹{a.v}</div>
              <div className="mt-2 h-[4px] bg-[#F0F0E9] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${a.tone==="em"?"bg-[#047857]":a.tone==="am"?"bg-[#B45309]":"bg-[#B91C1C]"}`} style={{width:`${a.w*1.2}%`,maxWidth:"100%"}}></div>
              </div>
              <div className="mt-2 text-[11px] text-[#6B7280]">{a.c} dealers</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-7 py-5">
        <Section eyebrow="Overdue" title="Action queue · 6 invoices need follow-up"
          right={
            <div className="flex items-center gap-2">
              <div className="chip"><Icon name="filter" size={12}/> All buckets <Icon name="chevron-down" size={12}/></div>
              <button className="btn btn-sm"><Icon name="send" size={13}/> Bulk reminder</button>
            </div>
          }>
          <table className="w-full">
            <thead>
              <tr className="table-head">
                <th className="text-left font-medium px-5 py-3 w-[34px]"><input type="checkbox" className="rounded-[3px]"/></th>
                <th className="text-left font-medium py-3">Dealer</th>
                <th className="text-left font-medium py-3">Order</th>
                <th className="text-right font-medium py-3">Amount</th>
                <th className="text-right font-medium py-3">Days overdue</th>
                <th className="text-left font-medium py-3 pl-3">Last reminder</th>
                <th className="text-right font-medium py-3 pr-5">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {OVERDUE.map((o,i)=>(
                <tr key={i} className="row hairline-b row-h">
                  <td className="px-5"><input type="checkbox" className="rounded-[3px]"/></td>
                  <td className="font-medium">{o.dealer}</td>
                  <td className="mono text-[12px]">{o.ord}</td>
                  <td className="num text-right font-medium">₹{o.v}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-[4px] w-[60px] bg-[#F0F0E9] rounded-full overflow-hidden">
                        <div className={`h-full ${o.tone==="ro"?"bg-[#B91C1C]":"bg-[#B45309]"}`} style={{width:`${Math.min(o.days,100)}%`}}></div>
                      </div>
                      <span className={`num font-medium ${o.tone==="ro"?"text-[#B91C1C]":"text-[#B45309]"}`}>{o.days}d</span>
                    </div>
                  </td>
                  <td className="pl-3 text-[12.5px] text-[#6B7280] mono">{o.last}</td>
                  <td className="pr-5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="btn btn-sm">Send reminder</button>
                      <button className="btn btn-sm btn-pri">Record</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   10) DISPATCH
============================================================ */
const PENDING = [
  {id:"ORD-2611", dealer:"Uma Trading Co",        units:760, val:"45.39 L", since:"2d", priority:"high",  active:true},
  {id:"ORD-2614", dealer:"Helios Renewables",     units:130, val:"7.80 L",  since:"1d", priority:"med"},
  {id:"ORD-2598", dealer:"Green Power EPC",       units:240, val:"14.82 L", since:"3d", priority:"high"},
  {id:"ORD-2618", dealer:"Surya Solar Solutions", units:600, val:"38.20 L", since:"4h", priority:"low"},
  {id:"ORD-2621", dealer:"Sunfield Power",        units:200, val:"11.60 L", since:"6h", priority:"med"},
];

const PICKED = [
  "PRM610-2025-08-1143","PRM610-2025-08-1144","PRM610-2025-08-1145",
  "PRM610-2025-08-1146","PRM610-2025-08-1147","PRM610-2025-08-1148",
];

const Dispatch = () => {
  const tweaks = useTweakValues();
  return (
  <Shell active="dis" crumbs={[tweaks.company,"Dispatch"]}
    topRight={
      <div className="flex items-center gap-2">
        <button className="btn btn-sm"><Icon name="qr-code" size={13}/> Scan mode</button>
        <button className="btn btn-sm btn-acc"><Icon name="check-circle-2" size={13}/> Confirm dispatch</button>
      </div>
    }>
    <div className="h-full flex">
      {/* queue */}
      <aside className="w-[340px] hairline-r bg-white flex flex-col">
        <div className="px-5 py-4 hairline-b">
          <div className="titlecaps">Pending dispatch</div>
          <div className="text-[20px] font-semibold tracking-[-0.02em] mt-1">7 orders <span className="serif-i text-[#6B7280] font-normal text-[16px]">in queue</span></div>
        </div>
        <div className="overflow-auto flex-1">
          {PENDING.map((p,i)=>(
            <button key={p.id} className={`w-full text-left px-5 py-3 hairline-b ${p.active?"bg-[#F0EFFF]":"hover:bg-[#FBFBF8]"}`}>
              <div className="flex items-center justify-between">
                <span className="mono text-[11.5px] font-medium">{p.id}</span>
                {p.priority==="high" ? <Chip tone="ro" dot>high</Chip> : p.priority==="med" ? <Chip tone="am" dot>med</Chip> : <Chip tone="mu">low</Chip>}
              </div>
              <div className="text-[13px] font-semibold mt-1">{p.dealer}</div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="mono text-[11px] text-[#6B7280]">{p.units} units · ₹{p.val}</span>
                <span className="mono text-[11px] text-[#94928A]">{p.since}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* selected order */}
      <div className="flex-1 overflow-auto">
        <div className="px-7 pt-6 pb-4 hairline-b bg-[#FBFBF8]">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 titlecaps">
                <span className="mono">ORD-2611</span>
                <Chip tone="em" dot>Paid · 100%</Chip>
                <Chip tone="in" dot>760 / 760 reserved</Chip>
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
                Uma Trading Co <span className="serif-i text-[#6B7280] font-normal">— pick & pack from WH-01 Bhiwandi</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Avatar initials="DV" color="#9D174D"/>
              <div className="leading-tight">
                <div className="text-[12.5px] font-medium">D. Verma</div>
                <div className="mono text-[10.5px] text-[#6B7280]">dispatch · 2 active</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5 px-7 py-6">
          {/* serial picker */}
          <div className="col-span-7 flex flex-col gap-4">
            <Section eyebrow="Serial picker" title="6 of 760 picked"
              right={
                <div className="flex items-center gap-2">
                  <div className="chip"><Icon name="package" size={12}/> 610 Wp NDCR <Icon name="chevron-down" size={12}/></div>
                  <button className="btn btn-sm"><Icon name="clipboard-paste" size={13}/> Bulk paste</button>
                </div>
              }>
              <div className="px-5 py-4">
                <div className="hairline rounded-[6px] bg-[#FBFBF8] flex items-center h-[44px] px-3 gap-2">
                  <Icon name="scan-line" size={16} className="text-[#3730A3]"/>
                  <input placeholder="Scan or paste serial — auto-advances" className="flex-1 text-[13px] bg-transparent outline-none mono placeholder:text-[#94928A]"/>
                  <span className="kbd">↵</span>
                </div>
                {/* progress */}
                <div className="mt-4 flex items-center gap-3 text-[12.5px]">
                  <span className="num font-semibold">6</span>
                  <div className="flex-1 h-[6px] bg-[#F0F0E9] rounded-full overflow-hidden">
                    <div className="h-full bg-[#0B0F1A]" style={{width:"0.8%"}}></div>
                  </div>
                  <span className="num text-[#6B7280]">760</span>
                </div>
                {/* picked list */}
                <div className="mt-4">
                  <div className="titlecaps mb-2">Just scanned</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PICKED.map(sn=>(
                      <span key={sn} className="inline-flex items-center gap-1.5 px-2 h-[24px] rounded-[4px] bg-[#0B0F1A] text-white mono text-[10.5px]">
                        <Icon name="check" size={11}/>{sn}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 px-2 h-[24px] rounded-[4px] hairline mono text-[10.5px] text-[#6B7280] border-dashed bg-white">
                      next →
                    </span>
                  </div>
                </div>
                {/* warnings */}
                <div className="mt-4 flex items-center gap-2 text-[12px] bg-[#FFFBEB] hairline rounded-[6px] px-3 py-2 text-[#92400E]">
                  <Icon name="alert-triangle" size={13}/>
                  <span>FIFO suggestion — pick from procurement batch <span className="mono font-semibold">PO-882 · 08 Aug</span> (oldest available).</span>
                </div>
              </div>
            </Section>

            <Section eyebrow="LR & vehicle" title="Logistics entry">
              <div className="grid grid-cols-2 gap-px bg-[#E3E3DC] hairline-t">
                {[
                  {l:"Carrier",   v:"VRL Logistics",      sub:"Bhiwandi → BKC"},
                  {l:"LR number", v:"MH-12-DR-7740",      sub:"Generated 04 May 09:18"},
                  {l:"Vehicle",   v:"MH-04-FL-2241",      sub:"Tata Prima 3128 · 25 ton"},
                  {l:"Driver",    v:"Suresh Kadam",       sub:"+91 98220 41882"},
                ].map(f=>(
                  <div key={f.l} className="bg-white p-4">
                    <div className="titlecaps">{f.l}</div>
                    <div className="mono text-[14px] mt-1">{f.v}</div>
                    <div className="text-[11px] text-[#6B7280] mt-0.5">{f.sub}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* invoice preview */}
          <div className="col-span-5">
            <Section eyebrow="On confirmation" title="Tax invoice will be generated"
              right={<Chip tone="in" dot>preview</Chip>}>
              <div className="p-5 bg-[#EFEFEA]">
                <div className="paper hairline mx-auto" style={{fontSize:11}}>
                  <div className="p-5">
                    <div className="flex items-start justify-between border-b border-[#0B0F1A] pb-2">
                      <div>
                        <div className="text-[12px] font-semibold">{tweaks.company}</div>
                        <div className="text-[9px] text-[#6B7280] mt-0.5">GSTIN 27AABCM4441P1ZJ</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-semibold tracking-[-0.01em]">TAX INVOICE</div>
                        <div className="mono text-[8.5px] text-[#6B7280] mt-0.5">TI-1108 / 26-27</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
                      <div>
                        <div className="text-[#6B7280] uppercase tracking-[0.08em] text-[7.5px]">Bill to</div>
                        <div className="font-semibold">Uma Trading Co</div>
                        <div className="leading-snug">14, MIDC, Andheri (E)<br/>Mumbai 400093, MH</div>
                      </div>
                      <div>
                        <div className="text-[#6B7280] uppercase tracking-[0.08em] text-[7.5px]">LR / e-way</div>
                        <div className="mono">MH-12-DR-7740</div>
                        <div className="mono">EWB 4221-8821-3304</div>
                      </div>
                    </div>
                    <div className="mt-3 hairline-t pt-2 flex justify-between text-[10px]">
                      <span>Taxable</span><span className="num">₹40,53,098</span>
                    </div>
                    <div className="flex justify-between text-[10px]"><span>CGST 6%</span><span className="num">₹2,43,186</span></div>
                    <div className="flex justify-between text-[10px]"><span>SGST 6%</span><span className="num">₹2,43,186</span></div>
                    <div className="hairline-t mt-1 pt-1 flex justify-between font-semibold text-[12px]">
                      <span>Grand total</span><span className="num">₹45,39,469</span>
                    </div>
                    <div className="mt-3 text-[8px] text-[#6B7280]">Auto-numbered on confirm · IRN will be generated via GSTN portal</div>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   11) REPORTS
============================================================ */
const REPORT_TILES = [
  {key:"pipe",  title:"Pipeline health",     desc:"Stage conversion, stuck deals, win rate trend",       icon:"git-branch", num:"38.2%", sub:"win rate · 30d", trend:[20,28,32,30,38,42,38]},
  {key:"vel",   title:"Sales velocity",      desc:"Deal value × win rate ÷ cycle length",                icon:"gauge",      num:"₹6.84 L/d", sub:"velocity index", trend:[18,22,28,30,34,32,42]},
  {key:"inv",   title:"Inventory turnover",  desc:"Stock aging, dead stock, FIFO discipline",            icon:"box",        num:"4.2×",  sub:"annualised", trend:[40,38,36,34,32,30,28]},
  {key:"age",   title:"Payment aging",       desc:"DSO, bucket distribution, recovery curves",            icon:"banknote",   num:"28d",   sub:"DSO · -3d MoM", trend:[40,38,36,34,32,30,28]},
  {key:"disp",  title:"Dispatch performance",desc:"On-time rate, avg pick time, LR cycle",                icon:"truck",      num:"94.6%", sub:"on-time", trend:[78,82,84,88,90,92,94]},
  {key:"seg",   title:"Dealer segmentation", desc:"Cat A/B/C revenue mix, churn, RFM scoring",            icon:"users",      num:"38·112·68", sub:"A · B · C", trend:[20,40,40,40,40,40,40]},
  {key:"gst",   title:"GST summary",         desc:"GSTR-1 / 3B reconciliation, ITC, e-invoice status",   icon:"receipt",    num:"100%",  sub:"reconciled · Apr", trend:[80,84,88,92,96,98,100]},
  {key:"comm",  title:"Commission & margins",desc:"Per-product margin, manufacturer scheme tracking",    icon:"percent",    num:"14.8%", sub:"avg margin", trend:[12,13,14,14,15,15,15]},
];

const Reports = () => {
  const tweaks = useTweakValues();
  return (
  <Shell active="rep" crumbs={[tweaks.company,"Reports"]}
    topRight={
      <div className="flex items-center gap-2">
        <div className="chip"><Icon name="calendar" size={12}/> Apr 06 → May 06 <Icon name="chevron-down" size={12}/></div>
        <button className="btn btn-sm"><Icon name="download" size={13}/> Export · CSV</button>
        <button className="btn btn-sm"><Icon name="file-output" size={13}/> Export · PDF</button>
      </div>
    }>
    <div className="h-full overflow-auto">
      <div className="px-7 pt-6 pb-5 hairline-b">
        <div className="titlecaps">Reports · 8 standard</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
          Reports & analytics <span className="serif-i text-[#6B7280] font-normal">— click any tile to drill in</span>
        </h1>
      </div>
      <div className="px-7 py-6 grid grid-cols-4 gap-3">
        {REPORT_TILES.map(t=>(
          <button key={t.key} className="bg-white hairline rounded-[8px] p-5 text-left hover:shadow-[0_12px_30px_-12px_rgba(11,15,26,0.16)] transition flex flex-col gap-3 group">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-[7px] bg-[#0B0F1A] text-white flex items-center justify-center">
                <Icon name={t.icon} size={16}/>
              </div>
              <Icon name="arrow-up-right" size={14} className="text-[#9CA3AF] group-hover:text-[#0B0F1A]"/>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold tracking-[-0.005em]">{t.title}</h3>
              <p className="text-[11.5px] text-[#6B7280] mt-1 leading-snug">{t.desc}</p>
            </div>
            <div className="hairline-t pt-3 flex items-end justify-between">
              <div>
                <div className="num text-[20px] font-semibold tracking-[-0.01em]">{t.num}</div>
                <div className="text-[10.5px] text-[#6B7280] mono">{t.sub}</div>
              </div>
              <div className="flex items-end gap-[2px] h-[26px]">
                {t.trend.map((h,i)=>(<span key={i} className="bar" style={{width:4,height:`${h}%`,opacity:0.4+i*0.08}}></span>))}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* drilled-in preview */}
      <div className="px-7 pb-7">
        <Section eyebrow="Drill · pipeline health" title="Stage conversion · last 30 days"
          right={<div className="flex items-center gap-2">
            <div className="chip"><Icon name="users" size={12}/> All owners</div>
            <button className="icon-btn"><Icon name="maximize-2" size={14}/></button>
          </div>}>
          <div className="px-5 py-5 grid grid-cols-3 gap-6">
            <div>
              <div className="titlecaps">Funnel conversion</div>
              <div className="mt-3 flex flex-col gap-1.5">
                {[["Lead → Req",82],["Req → Quote",74],["Quote → Nego",61],["Nego → Confirm",48],["Confirm → Closed",91]].map(([l,p])=>(
                  <div key={l} className="flex items-center gap-2">
                    <span className="w-[120px] text-[12px]">{l}</span>
                    <div className="flex-1 h-[14px] bg-[#F0F0E9] rounded-[3px] overflow-hidden">
                      <div className="h-full bg-[#0B0F1A]" style={{width:`${p}%`}}></div>
                    </div>
                    <span className="w-[40px] text-right num text-[11.5px] font-medium">{p}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="titlecaps">Cycle by stage · days</div>
              <div className="mt-3 flex items-end gap-2 h-[140px]">
                {[2.4,3.1,4.6,6.8,2.2,5.4,1.8,3.0].map((d,i)=>(
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                    <span className="num text-[10.5px] text-[#6B7280]">{d}</span>
                    <div className="w-full bar" style={{height:`${d/8*100}%`}}></div>
                    <span className="mono text-[9px] text-[#94928A]">{i+1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="titlecaps">Win rate · weekly</div>
              <div className="mt-3 relative h-[140px]">
                <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="w-full h-full">
                  <polyline fill="none" stroke="#0B0F1A" strokeWidth="1.5" points="0,72 25,68 50,60 75,55 100,52 125,42 150,38 175,32 200,28"/>
                  <polyline fill="none" stroke="#9CA3AF" strokeWidth="1" strokeDasharray="2 2" points="0,80 25,72 50,72 75,68 100,60 125,55 150,50 175,46 200,42"/>
                </svg>
                <div className="absolute top-0 left-0 mono text-[10px] text-[#6B7280]">42%</div>
                <div className="absolute bottom-0 left-0 mono text-[10px] text-[#6B7280]">12%</div>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  </Shell>
  );
};

/* ============================================================
   12) SETTINGS
============================================================ */
const Settings = () => {
  const tweaks = useTweakValues();
  const sub = ["Profile","Company","Users & roles","Document templates","Notifications","Billing"];
  return (
  <Shell active="rep" crumbs={[tweaks.company,"Settings","Users & roles"]}
    topRight={null}>
    <div className="h-full flex">
      {/* sub-nav */}
      <aside className="w-[220px] hairline-r bg-white p-4 flex flex-col">
        <div className="titlecaps mb-3 px-2">Settings</div>
        {sub.map((s,i)=>(
          <a key={s} className={`px-2.5 h-[34px] rounded-[5px] flex items-center text-[13px] ${i===2?"bg-[#0B0F1A] text-white":"text-[#1A2030] hover:bg-[#F0F0E9]"}`}>
            {s}
          </a>
        ))}
        <div className="mt-auto pt-4 hairline-t text-[11px] text-[#94928A] mono px-2">v0.3.4 · build 41a8</div>
      </aside>

      <div className="flex-1 overflow-auto">
        <div className="px-8 pt-7 pb-5 hairline-b max-w-[860px]">
          <div className="titlecaps">Settings · Users & roles</div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] mt-1">
            Users & roles <span className="serif-i text-[#6B7280] font-normal">— 4 roles, 12 active members</span>
          </h1>
          <p className="text-[13px] text-[#4B5563] mt-2 leading-relaxed max-w-[640px]">
            Permissions are enforced at the API layer. Each tenant has Admin, Sales, Accounts, and Dispatch — assign people, never custom-build a role per person.
          </p>
        </div>

        <div className="px-8 py-6 max-w-[860px] flex flex-col gap-5">
          {/* roles cards */}
          <div className="grid grid-cols-4 gap-px bg-[#E3E3DC] hairline rounded-[8px] overflow-hidden">
            {[
              {r:"Admin",    n:2, c:"#0B0F1A"},
              {r:"Sales",    n:5, c:"#3730A3"},
              {r:"Accounts", n:2, c:"#047857"},
              {r:"Dispatch", n:3, c:"#9D174D"},
            ].map(x=>(
              <div key={x.r} className="bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="dot" style={{background:x.c}}></span>
                  <span className="text-[12.5px] font-medium">{x.r}</span>
                </div>
                <div className="num text-[20px] font-semibold mt-1">{x.n} <span className="text-[12px] text-[#6B7280] font-normal">members</span></div>
              </div>
            ))}
          </div>

          {/* members table */}
          <Section eyebrow="Members" title="12 people"
            right={
              <div className="flex items-center gap-2">
                <div className="hairline rounded-[6px] bg-white flex items-center h-[32px] px-2.5 gap-2 w-[200px]">
                  <Icon name="search" size={13} className="text-[#6B7280]"/>
                  <input placeholder="Search members" className="flex-1 text-[12.5px] bg-transparent outline-none"/>
                </div>
                <button className="btn btn-sm btn-pri"><Icon name="user-plus" size={13}/> Invite</button>
              </div>
            }>
            <table className="w-full text-[13px]">
              <thead><tr className="table-head">
                <th className="text-left font-medium px-5 py-2.5">Name</th>
                <th className="text-left font-medium py-2.5">Email</th>
                <th className="text-left font-medium py-2.5">Role</th>
                <th className="text-left font-medium py-2.5">Last active</th>
                <th className="text-left font-medium py-2.5">Status</th>
                <th className="w-[40px]"></th>
              </tr></thead>
              <tbody>
                {[
                  {n:tweaks.userName, e:"akshay@mittal-distributors.in",  r:"Admin",   ra:"now",     s:"em", c:"#3730A3"},
                  {n:"Anjali Kapoor",   e:"anjali.k@mittal-distributors.in",  r:"Sales",   ra:"4m",      s:"em", c:"#0F766E"},
                  {n:"Niraj Pawar",     e:"niraj.p@mittal-distributors.in",   r:"Sales",   ra:"22m",     s:"em", c:"#7C2D12"},
                  {n:"Deepak Verma",    e:"deepak.v@mittal-distributors.in",  r:"Dispatch",ra:"1h",      s:"em", c:"#9D174D"},
                  {n:"Sunita Rao",      e:"sunita.r@mittal-distributors.in",  r:"Accounts",ra:"3h",      s:"em", c:"#0B0F1A"},
                  {n:"Vikrant Joshi",   e:"vikrant.j@mittal-distributors.in", r:"Sales",   ra:"yesterday",s:"mu",c:"#7C2D12"},
                ].map((m,i)=>(
                  <tr key={i} className="hairline-b row-h hover:bg-[#FBFBF8]">
                    <td className="px-5">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={m.n.split(' ').map(w=>w[0]).slice(0,2).join('')} color={m.c}/>
                        <span className="font-medium">{m.n}</span>
                      </div>
                    </td>
                    <td className="text-[12.5px] mono text-[#1A2030]">{m.e}</td>
                    <td><Chip>{m.r}</Chip></td>
                    <td className="mono text-[12px] text-[#6B7280]">{m.ra}</td>
                    <td>{m.s==="em" ? <Chip tone="em" dot>Active</Chip> : <Chip tone="mu">Idle</Chip>}</td>
                    <td><button className="icon-btn"><Icon name="more-horizontal" size={14}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* permission matrix */}
          <Section eyebrow="Permission matrix" title="Who can do what"
            right={<button className="btn btn-sm"><Icon name="info" size={13}/> Defaults</button>}>
            <div className="px-5 py-4 overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="text-[#6B7280]">
                  <th className="text-left font-medium py-2"></th>
                  <th className="text-center font-medium py-2 w-[90px]">Admin</th>
                  <th className="text-center font-medium py-2 w-[90px]">Sales</th>
                  <th className="text-center font-medium py-2 w-[90px]">Accounts</th>
                  <th className="text-center font-medium py-2 w-[90px]">Dispatch</th>
                </tr></thead>
                <tbody>
                  {[
                    ["Manage dealers",      "✓","✓","—","—"],
                    ["Edit pipeline",       "✓","✓","—","—"],
                    ["Generate quotation",  "✓","✓","—","—"],
                    ["Record payment",      "✓","—","✓","—"],
                    ["Generate tax invoice","✓","—","✓","—"],
                    ["Reserve inventory",   "✓","—","—","✓"],
                    ["Mark dispatched",     "✓","—","—","✓"],
                    ["Manage users",        "✓","—","—","—"],
                    ["Tenant settings",     "✓","—","—","—"],
                  ].map((row,i)=>(
                    <tr key={i} className="hairline-b">
                      <td className="py-2.5 font-medium">{row[0]}</td>
                      {row.slice(1).map((c,j)=>(
                        <td key={j} className="text-center py-2.5">
                          {c==="✓" ? <span className="dot s-em"></span> : <span className="text-[#D5D5CC]">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </div>
  </Shell>
  );
};

Object.assign(window, { Login, Catalog, Inventory, Order, Payments, Dispatch, Reports, Settings });
