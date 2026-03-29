import { motion } from 'framer-motion';

export default function Hero({ onInitialize }) {
  return (
    <main className="w-full">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 px-6 overflow-hidden">
        {/* Ambient Background Lights */}
        <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] aurora-blur opacity-50 pointer-events-none"></div>
        <div 
          className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] aurora-blur opacity-30 pointer-events-none" 
          style={{ background: 'radial-gradient(circle, rgba(0,238,252,0.15) 0%, transparent 100%)' }}
        ></div>
        
        <div className="z-10 text-center max-w-6xl">
          <span className="font-label text-sm uppercase tracking-[0.4em] text-primary mb-8 block">
            Synthetic Intelligence Neural Protocol
          </span>
          <h1 className="font-headline text-7xl md:text-[9rem] font-black leading-[0.85] tracking-tighter liquid-text mb-12">
            An Entire<br />Content Team<br />In One Click.
          </h1>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <button 
              onClick={onInitialize}
              className="group relative px-10 py-5 rounded-full bg-transparent border border-primary-dim/50 text-white font-headline font-bold uppercase tracking-widest overflow-hidden transition-all duration-500 hover:border-primary"
            >
              <span className="relative z-10">Initialize Workspace</span>
              <div className="absolute inset-0 bg-primary/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
            </button>
            <button className="group flex items-center gap-3 px-10 py-5 text-on-surface-variant font-headline font-bold uppercase tracking-widest hover:text-white transition-colors">
              <span className="material-symbols-outlined text-primary">play_arrow</span>
              Watch Demo
            </button>
          </div>
        </div>

        {/* Visual Anchor */}
        <div className="mt-24 w-full max-w-5xl aspect-video rounded-xl overflow-hidden glass-card p-1 shadow-2xl relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/10 opacity-50"></div>
          <img 
            className="w-full h-full object-cover rounded-lg opacity-80 group-hover:scale-110 transition-transform duration-1000 grayscale hover:grayscale-0" 
            alt="Abstract 3D rendering of fluid violet and cyan silk flowing through a dark void with ethereal lighting and micro-particles" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAch1RPPJU7Exx1peWVv27yetgd0bALn5Q-gxDOK_oxeQnfId3lIL0GYM3Dk1nBNAWyzG1sMpupfNiWXTGfg0nuGH1cTqalLn5WF_Chp-bUQcL7Nxt53DXjyvyMpMAkf722N_YNBPjLLJKB_Izhc3YssSJVIwk0c5rFoyAsv2l46F_mzRG9xxcPVCNoKXuT_MBixPlibxLh5luUIgyD1RD4VCSmol4zVnTH-parxa1W2RVZN7HwyekQY8JdFzR5xNurBWnX9Qtg7aQ" 
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform cursor-pointer">
              <span className="material-symbols-outlined text-4xl text-white">magic_button</span>
            </div>
          </div>
        </div>
      </section>

      {/* Meet Your Team Section */}
      <section className="py-32 bg-surface">
        <div className="px-12 mb-24">
          <h2 className="font-headline text-5xl font-black uppercase tracking-tighter mb-4">The Synthetic Five</h2>
          <div className="w-24 h-1 bg-primary"></div>
        </div>

        {/* Asymmetrical Scroll Layout */}
        <div className="flex flex-col gap-0">
          {/* Agent 1: Strategist */}
          <div className="relative group h-[600px] md:h-[819px] flex items-center overflow-hidden bg-surface-container-low">
            <div className="absolute right-0 w-1/2 h-full grayscale group-hover:grayscale-0 transition-all duration-700">
              <img 
                className="w-full h-full object-cover opacity-60 md:opacity-100" 
                alt="Futuristic cyborg conceptual portrait" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC0nCIhYPmWUo0vXA0tXo2xl2XRDG_SR-X4TtmSWEqCKx4rDYzGxo-oP48_LC-0ajGx32_Z3kmgVM00akNAuCmLZKB4HLffEtelB6v3T4Rvol7jm-qlbpz-3T2Z2dTRAkRGtNWDRDMJCTiWfCeXQbbo92pi-pGpYBufaucM3kJreyQb1BObGrqTlXR6o4u58mPj2wB-6IcVuKBnh8mzkDMR1t05lQLg82PZBufTUYXS9jkA6lmj8jL7Y9kJbf2F9LwKZgLwTv_FLbo" 
              />
            </div>
            <div className="relative z-10 pl-6 md:pl-24 w-full md:w-2/3">
              <span className="font-label text-primary-fixed-dim text-xl mb-4 block">01</span>
              <h3 className="font-headline text-6xl md:text-[10rem] font-black uppercase opacity-50 md:opacity-20 group-hover:opacity-100 transition-opacity duration-700 leading-none md:-ml-4">Strategist</h3>
              <p className="max-w-md mt-8 text-on-surface-variant text-base md:text-lg leading-relaxed">
                Orchestrates multi-channel narratives using predictive trend analysis. The neural core of your brand's trajectory.
              </p>
            </div>
          </div>

          {/* Agent 2: Researcher */}
          <div className="relative group h-[600px] md:h-[819px] flex items-center justify-end overflow-hidden">
            <div className="absolute left-0 w-1/2 h-full grayscale group-hover:grayscale-0 transition-all duration-700">
              <img 
                className="w-full h-full object-cover opacity-60 md:opacity-100" 
                alt="Macro photography of high-tech integrated circuit board" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuD10Lw3E9SwvXB69p6J8xy_mU6jxaohfBEZQ9QN8UDuEOSscDeTLMQKjU2lwZfb3Qp0x1jDnKUI8kaK8xLtfdN12_zI7WVghOgqVzxd_jpJFp25ntNMVK9SSSh2XXH9cbidk3uV1Aznh8LMjyhNoHFDBmGKBp66unNb_wLDhIKFoh8e26zNWNjtN6BIMz4HSQ8LXrTGmIdZYc_raPXAKvxWclJzvNZsbzyYw4h5wubN84pilDUzIffBQA1uAIvOb57cT4YhTtGj3_4" 
              />
            </div>
            <div className="relative z-10 pr-6 md:pr-24 text-right">
              <span className="font-label text-secondary text-xl mb-4 block">02</span>
              <h3 className="font-headline text-6xl md:text-[10rem] font-black uppercase opacity-50 md:opacity-20 group-hover:opacity-100 transition-opacity duration-700 leading-none">Researcher</h3>
              <p className="max-w-md mt-8 ml-auto text-on-surface-variant text-base md:text-lg leading-relaxed">
                Crawls the latent space of the web to extract raw signals and verifiable facts with zero hallucination protocols.
              </p>
            </div>
          </div>

          {/* Agent 3: Writer */}
          <div className="relative group h-[600px] md:h-[819px] flex items-center overflow-hidden bg-surface-container-low">
            <div className="absolute right-0 w-1/2 h-full grayscale group-hover:grayscale-0 transition-all duration-700">
              <img 
                className="w-full h-full object-cover opacity-60 md:opacity-100" 
                alt="Digital art of a crystalline hand writing on a holographic interface" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCRNisjoqeXWZd4t_w4ssNe9uvxVwY50SAi3aabjvZh4_s9WYRyZocZD-hVNtwbMI3TnSThdwAu7xZ_t0JBjg2BlpH8oScgAeSlM7oljoLjkFNHoaGI8Suw6wLzRByerF1cHMVSDZonhUI-9nchUt1HGTfJRbRvnYCgB7b6vz6ahZHdomMmAT4NyEk877Fr9x5FBKj34fDTfIikS8Rz3ERMVcpns43-YBLOqa5EFfMdque4nqrPdz3Lv7zA5YlG_WTUJq84JjmYFhw" 
              />
            </div>
            <div className="relative z-10 pl-6 md:pl-24 w-full md:w-2/3">
              <span className="font-label text-primary-fixed-dim text-xl mb-4 block">03</span>
              <h3 className="font-headline text-6xl md:text-[10rem] font-black uppercase opacity-50 md:opacity-20 group-hover:opacity-100 transition-opacity duration-700 leading-none md:-ml-4">Writer</h3>
              <p className="max-w-md mt-8 text-on-surface-variant text-base md:text-lg leading-relaxed">
                Translates complex strategies into evocative prose that resonates with human emotion and algorithmic logic.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Unfair Advantage Section */}
      <section className="py-32 px-6 md:px-12 bg-surface-container-lowest overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] aurora-blur opacity-20 pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
        <div className="max-w-7xl mx-auto z-10 relative">
          <div className="mb-20 md:mb-32">
            <span className="font-label text-primary-dim uppercase tracking-widest text-xs mb-4 block">System Overrides</span>
            <h2 className="font-headline text-5xl md:text-8xl font-black uppercase tracking-tighter max-w-4xl leading-tight">
              The <span className="text-primary italic">V2 Loophole</span> Fixes.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-20 md:gap-y-32 gap-x-24">
            {/* Feature 1 */}
            <div className="group border-l border-outline-variant/30 pl-8 md:pl-12 hover:border-primary transition-colors duration-500">
              <span className="font-label text-sm text-secondary-dim mb-2 block">Protocol 001</span>
              <h4 className="font-headline text-2xl md:text-3xl uppercase font-bold mb-4 md:mb-6 group-hover:text-primary transition-colors">Zero Hallucinations</h4>
              <p className="text-on-surface-variant leading-relaxed text-base md:text-lg">
                Cross-referenced validation against live data streams. Every claim is anchored in reality, verified by a secondary auditing neural net.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group border-l border-outline-variant/30 pl-8 md:pl-12 hover:border-primary transition-colors duration-500">
              <span className="font-label text-sm text-secondary-dim mb-2 block">Protocol 002</span>
              <h4 className="font-headline text-2xl md:text-3xl uppercase font-bold mb-4 md:mb-6 group-hover:text-primary transition-colors">Immutable Brand Voice</h4>
              <p className="text-on-surface-variant leading-relaxed text-base md:text-lg">
                Locks your brand's linguistic DNA. No drift, no generic filler. A consistent persona across 10,000 pages of content.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group border-l border-outline-variant/30 pl-8 md:pl-12 hover:border-primary transition-colors duration-500">
              <span className="font-label text-sm text-secondary-dim mb-2 block">Protocol 003</span>
              <h4 className="font-headline text-2xl md:text-3xl uppercase font-bold mb-4 md:mb-6 group-hover:text-primary transition-colors">Time-Travel Rollbacks</h4>
              <p className="text-on-surface-variant leading-relaxed text-base md:text-lg">
                State-saving on every draft. Revert specific creative decisions across entire campaigns with non-destructive versioning.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group border-l border-outline-variant/30 pl-8 md:pl-12 hover:border-primary transition-colors duration-500">
              <span className="font-label text-sm text-secondary-dim mb-2 block">Protocol 004</span>
              <h4 className="font-headline text-2xl md:text-3xl uppercase font-bold mb-4 md:mb-6 group-hover:text-primary transition-colors">Parallel Drafting</h4>
              <p className="text-on-surface-variant leading-relaxed text-base md:text-lg">
                Generate 50 variations of a single concept simultaneously. Test narrative directions in seconds, not weeks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-48 px-6 bg-surface flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[1200px] h-[600px] aurora-blur opacity-40"></div>
        </div>
        <div className="relative z-10 w-full">
          <h2 className="font-headline text-5xl md:text-8xl font-black uppercase mb-12 tracking-tighter">Ready to <span className="text-primary cursor-pointer hover:text-white transition-colors duration-300" onClick={onInitialize}>Conjure</span>?</h2>
          <p className="text-on-surface-variant text-lg md:text-xl mb-16 max-w-2xl mx-auto">
            Join the vanguard of content architecture. Deploy your team in less than 60 seconds.
          </p>
          <button 
            onClick={onInitialize}
            className="bg-primary text-on-primary px-10 md:px-16 py-6 md:py-8 rounded-full font-headline font-black text-xl md:text-2xl uppercase tracking-tighter hover:scale-110 transition-transform duration-500 shadow-[0_0_50px_rgba(223,142,255,0.4)]"
          >
            Initialize System
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative w-full overflow-hidden bg-surface-container-lowest flex flex-col items-center pt-32 pb-12 px-6 md:px-8 text-center text-white border-t border-outline-variant/20">
        <div className="font-headline font-bold text-6xl md:text-[12rem] leading-none tracking-tighter uppercase text-primary opacity-20 hover:tracking-widest transition-all duration-700 select-none">
          ALCHEMIST
        </div>
        
        <div className="mt-20 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-8 w-full max-w-6xl text-center md:text-left border-t border-outline-variant/10 pt-16">
          <div className="md:col-span-2 flex flex-col items-center md:items-start">
            <span className="font-headline text-xl font-black uppercase tracking-tighter text-white mb-6 block">Alchemist Interface</span>
            <p className="text-on-surface-variant max-w-xs text-sm leading-relaxed">Building the future of synthetic collaboration. Elevating human creativity through neural alignment.</p>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs uppercase text-primary mb-4 block">System</span>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Neural Protocol</a>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">System Status</a>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Archive</a>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs uppercase text-primary mb-4 block">Social</span>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Twitter</a>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Discord</a>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs uppercase text-primary mb-4 block">Legal</span>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Privacy</a>
            <a className="text-on-surface-variant hover:text-primary transition-all text-sm uppercase font-bold" href="#">Terms</a>
          </div>
        </div>
        
        <div className="mt-24 text-[10px] sm:text-xs tracking-[0.3em] sm:tracking-[0.5em] text-on-surface-variant uppercase font-label">
          ©2026 ALCHEMIST INTERFACE. ALL RIGHTS RESERVED.
        </div>
      </footer>
    </main>
  );
}
