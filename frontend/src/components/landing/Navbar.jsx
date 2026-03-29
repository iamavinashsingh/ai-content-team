export default function Navbar({ onInitialize }) {
  return (
    <nav className="fixed top-0 w-full z-50 bg-neutral-950/60 backdrop-blur-xl flex justify-between items-center px-6 md:px-12 py-6 max-w-full mx-auto shadow-[0_0_40px_-10px_rgba(189,0,255,0.05)]">
      <div className="text-2xl font-black tracking-tighter text-white uppercase font-headline">ALCHEMIST</div>
      <div className="hidden md:flex gap-12">
        <a className="font-headline tracking-tighter uppercase text-sm text-white border-b-2 border-primary pb-1 hover:scale-105 transition-transform duration-300 ease-out" href="#">Process</a>
        <a className="font-headline tracking-tighter uppercase text-sm text-neutral-400 hover:text-white transition-colors hover:scale-105 transition-transform duration-300 ease-out" href="#">Artifacts</a>
        <a className="font-headline tracking-tighter uppercase text-sm text-neutral-400 hover:text-white transition-colors hover:scale-105 transition-transform duration-300 ease-out" href="#">Lab</a>
        <a className="font-headline tracking-tighter uppercase text-sm text-neutral-400 hover:text-white transition-colors hover:scale-105 transition-transform duration-300 ease-out" href="#">Nexus</a>
      </div>
      <button 
        onClick={onInitialize}
        className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-headline font-bold text-sm uppercase px-8 py-3 rounded-full hover:scale-105 transition-transform duration-300 active:scale-95"
      >
        Conjure
      </button>
    </nav>
  );
}
