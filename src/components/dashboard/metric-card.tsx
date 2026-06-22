import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
  delta?: {
    sign: number
    label: string
  }
  subtitle?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle }: MetricCardProps) {
  return (
    <div 
      className="relative overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
      style={{
        background: 'rgba(17, 24, 39, 0.5)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'rgba(148, 163, 184, 0.08)',
      }}
    >
      {/* Gradient border on hover */}
      <div 
        className="absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: 'linear-gradient(90deg, #7c3aed, #3b82f6, #06b6d4)',
          borderRadius: '16px 16px 0 0',
        }}
      />
      
      <div className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>{title}</p>
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-[28px] leading-none font-extrabold tabular-nums tracking-tight text-white">
          {value}
        </p>
        {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
          <p className="mt-2 text-sm" style={{ color: '#64748b' }}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone = sign > 0 ? 'text-emerald-400' : sign < 0 ? 'text-rose-400' : 'text-slate-500'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2 flex items-center gap-1 text-sm font-medium', tone)}>
      <Arrow className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  )
}