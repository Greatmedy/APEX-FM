import { motion } from 'framer-motion';

export default function AuthShell({ children, wide }) {
  return (
    <div className="min-h-screen px-3 py-8 flex flex-col items-center justify-center" style={{backgroundImage: "linear-gradient(180deg, rgba(7,17,31,.78) 0%, rgba(7,17,31,.88) 100%), url('/stadium.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',}}>
      <div className="flex items-center gap-3 mb-6">
        <img src='/logo.jpg' alt="APEX FM Logo" className="h-12 w-auto rounded-lg" />
        <div><p className="font-display text-3xl leading-none tracking-wide">APEX <span className="text-gold">FM</span></p><p className="text-xs text-slate-300 mt-1">Football Manager 2027</p></div>
      </div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`glass p-5 sm:p-7 w-full ${wide ? 'max-w-5xl' : 'max-w-md'} shadow-2xl`}>{children}</motion.div>
    </div>
  );
}
