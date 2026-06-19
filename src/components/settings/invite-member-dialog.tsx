'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, MessageCircle, Sparkles } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';

type InviteRole = 'admin' | 'agent' | 'viewer';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1 dia' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
];

const ROLE_DESCRIPTIONS: Record<InviteRole, string> = {
  admin:
    'Pode convidar colegas, gerenciar configurações, enviar mensagens e editar dados.',
  agent:
    'Pode usar a caixa de entrada, contatos, transmissões, automações e fluxos. Sem configurações ou acesso a membros.',
  viewer: 'Acesso somente leitura em todas as páginas. Não pode enviar ou editar nada.',
};

const MAX_LABEL_LEN = 80;

interface CreatedInvite {
  url: string;
  role: InviteRole;
  expiresInDays: number;
  accountName: string;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: InviteMemberDialogProps) {
  const { account } = useAuth();
  const [role, setRole] = useState<InviteRole>('agent');
  const [expiry, setExpiry] = useState<string>('7');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedInvite | null>(null);

  function reset() {
    setRole('agent');
    setExpiry('7');
    setLabel('');
    setResult(null);
    setSubmitting(false);
  }

  async function handleCreate() {
    const trimmedLabel = label.trim();
    if (trimmedLabel.length > MAX_LABEL_LEN) {
      toast.error(`O rótulo deve ter ${MAX_LABEL_LEN} caracteres ou menos`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          expiresInDays: Number(expiry),
          label: trimmedLabel || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao criar convite');
        return;
      }

      const data = (await res.json()) as {
        url: string;
        expiresInDays: number;
      };

      setResult({
        url: data.url,
        role,
        expiresInDays: data.expiresInDays,
        accountName: account?.name ?? 'nossa conta wacrm',
      });
      onCreated();
    } catch (err) {
      console.error('[InviteMemberDialog] erro ao criar:', err);
      toast.error('Não foi possível acessar o servidor. Tentar novamente?');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success('Link de convite copiado');
    } catch {
      toast.error('Área de transferência bloqueada — copie o link manualmente');
    }
  }

  function whatsappShareUrl(url: string): string {
    const accountName = result?.accountName ?? 'nossa conta wacrm';
    const message = `Junte-se a ${accountName} no wacrm usando este link (válido por ${result?.expiresInDays} dias): ${url}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Sparkles className="size-4 text-primary" />
                Convite criado
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Compartilhe este link com seu novo colega. Ele poderá
                se cadastrar (ou fazer login) e entrar na conta como{' '}
                <span className="font-medium text-slate-300">{result.role}</span>
                . O link é válido por{' '}
                <span className="font-medium text-slate-300">
                  {result.expiresInDays} dia{result.expiresInDays === 1 ? '' : 's'}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label className="text-slate-300">Link de convite</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.url}
                  className="bg-slate-800 border-slate-700 text-white font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  onClick={copyToClipboard}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                >
                  <Copy className="size-4" />
                  Copiar
                </Button>
              </div>

              <div className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                <strong className="font-semibold text-amber-100">
                  Salve este link agora.
                </strong>{' '}
                Nós nunca armazenamos o texto simples — uma vez que você feche este
                diálogo, a URL desaparece. Para compartilhar novamente, revogue este
                convite e crie um novo.
              </div>

              <a
                href={whatsappShareUrl(result.url)}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({
                  variant: 'outline',
                  className:
                    'w-full border-slate-700 text-slate-300 hover:bg-slate-800',
                })}
              >
                <MessageCircle className="size-4" />
                Enviar via WhatsApp
              </a>
            </div>

            <DialogFooter className="bg-slate-900 border-slate-700">
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Concluído
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">Convidar um colega</DialogTitle>
              <DialogDescription className="text-slate-400">
                Gere um link de convite único. Compartilhe via WhatsApp,
                Slack ou qualquer canal — não é necessário serviço de e-mail.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Função</Label>
                <Select
                  value={role}
                  onValueChange={(v) => v && setRole(v as InviteRole)}
                >
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="agent">Atendente</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Link válido por</Label>
                <Select
                  value={expiry}
                  onValueChange={(v) => v && setExpiry(v)}
                >
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">
                  Rótulo{' '}
                  <span className="text-xs text-slate-500">(opcional)</span>
                </Label>
                <Input
                  placeholder="ex. Sara — equipe de suporte"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={MAX_LABEL_LEN}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">
                  Ajuda a lembrar para quem você enviou o link na lista
                  de pendentes abaixo.
                </p>
              </div>
            </div>

            <DialogFooter className="bg-slate-900 border-slate-700">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Gerar link'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
