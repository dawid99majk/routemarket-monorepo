import type { ReactNode } from 'react';

/**
 * Głos agenta: awatar „A” i lawendowy dymek.
 *
 * Wcześniej każdy ekran rysował agenta po swojemu — pigułka z iskierką na
 * tablicy, ramka w oknie miejsca, pasek w Odkrywaj — i wszystkie w bursztynie,
 * który znaczył też „być może”. W Pocztówce agent ma własny kolor (lawenda)
 * i jeden kształt: wypowiedź, a nie etykietę.
 */
export default function AgentDymek({ children, maly = false, className = '' }: {
  children: ReactNode;
  maly?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <span aria-hidden
        className={`${maly ? 'w-7 h-7 text-[13px]' : 'w-8 h-8 text-[14px]'} shrink-0 rounded-full bg-agent-strong
                    text-white font-display font-bold flex items-center justify-center`}>
        A
      </span>
      <div className={`bg-agent text-agent-foreground rounded-[4px_18px_18px_18px] text-pretty ${
        maly ? 'px-3.5 py-2 text-[13.5px] leading-[1.45]' : 'px-4 py-2.5 text-[14.5px] leading-[1.45]'}`}>
        <span className="sr-only">Agent: </span>
        {children}
      </div>
    </div>
  );
}
