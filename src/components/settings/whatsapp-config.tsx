'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  Bot,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [aiAgentEnabled, setAiAgentEnabled] = useState(false);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Falha ao carregar configuração:', error);
      }

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setAiAgentEnabled(data.ai_agent_enabled ?? false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setAiAgentEnabled(false);
      }
      setRegistrationProbe(null);

      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Falha na verificação de saúde:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Falha ao carregar configuração do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('O ID do número de telefone é obrigatório');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('O token de acesso é obrigatório para a configuração inicial');
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error('Por favor, insira novamente o token de acesso para salvar as alterações');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar configuração');
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `Salvo, mas a Meta não conseguiu registrar o número: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        toast.success(
          'Credenciais salvas e verificadas. O registro de entrada foi ignorado (sem PIN) — veja o status do registro abaixo.',
          { duration: 10000 },
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Ativo — ${data.phone_info.verified_name} agora pode receber eventos.`
            : 'WhatsApp conectado. Os eventos começarão a fluir em um minuto.',
        );
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Falha ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Conectado a ${payload.phone_info.verified_name}`
            : 'Conexão com a API bem-sucedida'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'Falha na conexão com a API');
      }
    } catch (err) {
      console.error('Erro ao testar conexão:', err);
      setConnectionStatus('disconnected');
      toast.error('Falha no teste de conexão. Verifique a rede e tente novamente.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Número totalmente conectado — a Meta está entregando eventos.');
      } else {
        toast.error(
          'Número não totalmente registrado. Veja as verificações abaixo para identificar qual etapa falhou.',
          { duration: 8000 },
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('falha na verificação de registro:', err);
      toast.error('Não foi possível acessar o endpoint de verificação.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm('Isso excluirá a configuração atual do WhatsApp para que você possa inseri-la novamente. Continuar?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao redefinir configuração');
        return;
      }

      toast.success('Configuração limpa. Agora você pode inserir suas credenciais novamente.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Erro ao redefinir:', err);
      toast.error('Falha ao redefinir configuração');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada para a área de transferência');
  }

  async function handleToggleAiAgent(checked: boolean) {
    if (!config) {
      toast.error('Configure o WhatsApp primeiro');
      return;
    }
    try {
      setAiAgentEnabled(checked);
      const res = await fetch('/api/whatsapp/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_agent_enabled: checked }),
      });
      if (!res.ok) {
        setAiAgentEnabled(!checked);
        toast.error('Falha ao atualizar agente IA');
        return;
      }
      toast.success(checked ? 'Agente IA ativado' : 'Agente IA desativado');
    } catch {
      setAiAgentEnabled(!checked);
      toast.error('Falha ao atualizar agente IA');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] mt-4">
      <div className="space-y-6">
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  O token armazenado não pode ser descriptografado
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Redefinindo...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      Redefinir Configuração
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        <Alert className="bg-white/5 border-slate-700">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-white mb-0">
              {connectionStatus === 'connected' ? 'Credenciais válidas' : 'Não Conectado'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-slate-400">
            {connectionStatus === 'connected'
              ? 'Seu token de acesso autentica com a Meta. Veja o status do registro abaixo para verificar se os webhooks estão realmente conectados.'
              : statusMessage ||
                'Configure suas credenciais da API Meta abaixo para conectar sua conta do WhatsApp Business.'}
          </AlertDescription>
        </Alert>

        {config && (
          <Alert
            className={
              isRegistered
                ? 'bg-emerald-950/30 border-emerald-700/50'
                : 'bg-amber-950/30 border-amber-700/50'
            }
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {isRegistered ? (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-400" />
                )}
                <AlertTitle
                  className={
                    'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                  }
                >
                  {isRegistered
                    ? 'Registrado — a Meta entregará eventos ao wacrm'
                    : 'Não registrado — a Meta não entregará eventos'}
                </AlertTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyRegistration}
                disabled={verifyingRegistration}
                className="border-slate-700 bg-transparent text-slate-200 hover:bg-white/5 h-7"
              >
                {verifyingRegistration ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                Verificar com a Meta
              </Button>
            </div>
            <AlertDescription className="text-slate-400 mt-2 text-xs leading-relaxed">
              {isRegistered ? (
                <>
                  Inscrito desde{' '}
                  {config.registered_at
                    ? new Date(config.registered_at).toLocaleString()
                    : 'desconhecido'}
                  . Clique em <strong>Verificar com a Meta</strong> se os eventos
                  pararem de chegar.
                </>
              ) : lastRegistrationError ? (
                <>
                  Última tentativa falhou com:{' '}
                  <span className="text-red-300">
                    &quot;{lastRegistrationError}&quot;
                  </span>
                  . Insira (ou corrija) o PIN de verificação em duas etapas abaixo e clique em
                  Salvar Configuração para tentar novamente.
                </>
              ) : (
                <>
                  Este número foi salvo antes da existência do
                  rastreamento de registro, ou o registro foi ignorado. Insira o
                  PIN de verificação em duas etapas abaixo e clique em Salvar Configuração para
                  inscrevê-lo.
                </>
              )}
            </AlertDescription>

            {registrationProbe && (
              <div className="mt-3 rounded border border-slate-700 bg-white/5/60 px-3 py-2 space-y-1.5 text-[11px]">
                <p className="font-medium text-slate-200">
                  Diagnóstico — última execução: {' '}
                  <span className={registrationProbe.live ? 'text-emerald-400' : 'text-amber-400'}>
                    {registrationProbe.live ? 'ativo' : 'inativo'}
                  </span>
                </p>
                <ul className="space-y-0.5 text-slate-400">
                  {Object.entries(registrationProbe.checks).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {v === true ? (
                        <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                      ) : v === false ? (
                        <XCircle className="size-3 text-red-400 shrink-0" />
                      ) : (
                        <span className="size-3 rounded-full border border-slate-600 shrink-0" />
                      )}
                      <code className="text-slate-300">{k}</code>
                    </li>
                  ))}
                </ul>
                {(registrationProbe.errors ?? []).length > 0 && (
                  <ul className="pt-1 space-y-0.5 text-red-300">
                    {registrationProbe.errors?.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Alert>
        )}

        <Card className="bg-white/5 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white">Credenciais da API</CardTitle>
            <CardDescription className="text-slate-400">
              Insira suas credenciais da API do WhatsApp Business da Meta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">ID do Número de Telefone</Label>
              <Input
                placeholder="ex. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="bg-white/5 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">ID da Conta do WhatsApp Business</Label>
              <Input
                placeholder="ex. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="bg-white/5 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Token de Acesso Permanente</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Insira seu token de acesso"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-white/5 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-slate-500">
                  O token está oculto por segurança. Insira novamente para atualizar a configuração.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Token de Verificação do Webhook</Label>
              <Input
                placeholder="Crie um token de verificação personalizado"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-white/5 border-slate-700 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">
                Uma string personalizada que você cria. Deve corresponder ao token definido nas configurações de webhook da Meta.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">
                PIN de verificação em duas etapas
                <span className="ml-1 text-slate-500">(opcional)</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN de 6 dígitos do WhatsApp Manager da Meta"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="bg-white/5 border-slate-700 text-white placeholder:text-slate-500 tracking-widest"
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                Necessário apenas para conectar mensagens <strong className="text-slate-300">de entrada</strong>
                para um número de <strong className="text-slate-300">produção</strong>. Defina-o em{' '}
                <strong className="text-slate-300">
                  Meta Business Manager → Contas do WhatsApp → Números de
                  Telefone → Verificação em duas etapas
                </strong>
                , e cole aqui para que o wacrm possa inscrever o número —
                caso contrário, a Meta roteia eventos de entrada para o aplicativo
                que mais reivindicou (o sintoma que afeta números secundários
                em uma WABA compartilhada).{' '}
                <strong className="text-slate-300">Números de teste da Meta</strong> não têm
                PIN e estão pré-registrados — deixe em branco para eles.
                Deixar em branco também mantém um registro existente
                inalterado.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white">Configuração do Webhook</CardTitle>
            <CardDescription className="text-slate-400">
              Use esta URL como seu callback de webhook no Painel de Aplicativos da Meta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-slate-300">URL de Callback do Webhook</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-white/5 border-slate-700 text-slate-300 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-white/5"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bot className="size-5" />
              Agente IA
            </CardTitle>
            <CardDescription className="text-slate-400">
              Ative para que o agente IA responda automaticamente mensagens que não estão vinculadas ao fluxo de criação de site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-white">
                  Respostas automáticas com IA
                </p>
                <p className="text-xs text-slate-400">
                  Quando ativado, o agente responde saudações, dúvidas gerais e suporte usando Gemini + contexto do CRM.
                </p>
              </div>
              <Switch
                checked={aiAgentEnabled}
                onCheckedChange={handleToggleAiAgent}
                disabled={!config}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Configuração'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-slate-700 text-slate-300 hover:text-white hover:bg-white/5"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Testar Conexão da API
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Redefinir Configuração
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div>
        <Card className="bg-white/5 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white text-base">Instruções de Configuração</CardTitle>
            <CardDescription className="text-slate-400">
              Siga estes passos para conectar sua API do WhatsApp Business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    Criar um Aplicativo Meta
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Acesse <span className="text-primary">developers.facebook.com</span></li>
                    <li>Clique em &quot;Meus Aplicativos&quot; e depois em &quot;Criar Aplicativo&quot;</li>
                    <li>Selecione &quot;Negócios&quot; como o tipo de aplicativo</li>
                    <li>Preencha os detalhes do aplicativo e crie</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    Adicionar Produto WhatsApp
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>No painel do seu aplicativo, clique em &quot;Adicionar Produto&quot;</li>
                    <li>Encontre &quot;WhatsApp&quot; e clique em &quot;Configurar&quot;</li>
                    <li>Siga o assistente de configuração para vincular seu negócio</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    Obter Credenciais da API
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Acesse WhatsApp &gt; Configuração da API</li>
                    <li>Copie seu <strong className="text-slate-200">ID do Número de Telefone</strong></li>
                    <li>Copie seu <strong className="text-slate-200">ID da Conta do WhatsApp Business</strong></li>
                    <li>Gere um <strong className="text-slate-200">Token de Acesso Permanente</strong> em Configurações do Negócio &gt; Usuários do Sistema</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                    Configurar Webhooks
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Acesse WhatsApp &gt; Configuração</li>
                    <li>Clique em &quot;Editar&quot; na seção de Webhook</li>
                    <li>Cole a <strong className="text-slate-200">URL de Callback do Webhook</strong> acima</li>
                    <li>Insira o mesmo <strong className="text-slate-200">Token de Verificação</strong> que você definiu aqui</li>
                    <li>Inscreva-se no campo de webhook &quot;messages&quot;</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Documentação da API do WhatsApp da Meta
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
