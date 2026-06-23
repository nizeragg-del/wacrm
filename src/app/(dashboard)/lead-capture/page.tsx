'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Loader2, Search, Trash2, Play, Eye, Zap, ZapOff, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadCampaign } from '@/lib/lead-capture/types';

interface AutopilotConfig {
  is_active: boolean;
  locations: string[];
  categories: string[];
  max_messages_per_day: number;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  last_run_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  running: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

const CATEGORIES = [
  'restaurant',
  'dentist',
  'doctor',
  'lawyer',
  'mechanic',
  'pharmacy',
  'gym',
  'hotel',
  'bakery',
  'cafe',
  'supermarket',
  'school',
  'beauty',
  'vet',
  'bar',
];

export default function LeadCapturePage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  // Autopilot state
  const [autopilot, setAutopilot] = useState<AutopilotConfig | null>(null);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotConfig] = useState({
    max_messages_per_day: 100,
    follow_up_enabled: true,
    follow_up_delay_hours: 24,
  });

  // CNPJ Autopilot state
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjFile, setCnpjFile] = useState<File | null>(null);

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    location: '',
    category: '',
    radius_meters: 5000,
  });

  useEffect(() => {
    fetchCampaigns();
    fetchAutopilotConfig();
  }, []);

  async function fetchCampaigns() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch('/api/lead-capture', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Falha ao carregar campanhas');

      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    if (!newCampaign.name || !newCampaign.location || !newCampaign.category) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...newCampaign,
          auto_run: true,
        }),
      });

      if (!response.ok) throw new Error('Falha ao criar campanha');

      toast.success('Campanha criada e iniciada!');
      setShowNewDialog(false);
      setNewCampaign({ name: '', location: '', category: '', radius_meters: 5000 });
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar campanha');
    } finally {
      setCreating(false);
    }
  }

  async function runCampaign(campaignId: string) {
    setRunning(campaignId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch(`/api/lead-capture/${campaignId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Falha ao executar campanha');

      toast.success('Campanha iniciada!');
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar campanha');
    } finally {
      setRunning(null);
    }
  }

  async function deleteCampaign(campaignId: string) {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch(`/api/lead-capture/${campaignId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Falha ao deletar campanha');

      toast.success('Campanha deletada!');
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao deletar campanha');
    }
  }

  // Autopilot functions
  async function fetchAutopilotConfig() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch('/api/lead-capture/autopilot', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAutopilot(data.config);
      }
    } catch (err) {
      console.error('Failed to load autopilot config:', err);
    }
  }

  async function toggleAutopilot() {
    setAutopilotLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const action = autopilot?.is_active ? 'stop' : 'start';

      const response = await fetch('/api/lead-capture/autopilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          config: autopilotConfig,
        }),
      });

      if (!response.ok) throw new Error('Falha ao alterar autopilot');

      toast.success(action === 'start' ? 'Autopilot iniciado!' : 'Autopilot parado!');
      fetchAutopilotConfig();
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar autopilot');
    } finally {
      setAutopilotLoading(false);
    }
  }

  async function runAutopilotNow() {
    setAutopilotLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch('/api/lead-capture/autopilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'run' }),
      });

      if (!response.ok) throw new Error('Falha ao executar autopilot');

      toast.success('Autopilot executado!');
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar autopilot');
    } finally {
      setAutopilotLoading(false);
    }
  }

  async function runCNPJAutopilot() {
    if (!cnpjFile) {
      toast.error('Selecione um arquivo JSONL primeiro');
      return;
    }

    setCnpjLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const userId = session.user.id;
      const timestamp = Date.now();
      const baseName = cnpjFile.name.replace(/\.[^.]+$/, '');

      toast.info('Lendo arquivo...');

      const text = await cnpjFile.text();
      const allLines = text.split('\n').filter(l => l.trim());
      const CHUNK_SIZE = 10000;
      const totalChunks = Math.ceil(allLines.length / CHUNK_SIZE);

      toast.info(`${allLines.length} leads encontrados. Enviando em ${totalChunks} partes...`);

      const storagePaths: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunk = allLines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join('\n');
        const chunkPath = `${userId}/${timestamp}_${baseName}_part${i + 1}.jsonl`;
        const chunkBlob = new Blob([chunk], { type: 'application/x-ndjson' });

        const { error: uploadError } = await supabase.storage
          .from('cnpj-files')
          .upload(chunkPath, chunkBlob, {
            contentType: 'application/x-ndjson',
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error on chunk', i + 1, uploadError);
          toast.error(`Erro ao enviar parte ${i + 1}: ${uploadError.message}`);
          return;
        }

        storagePaths.push(chunkPath);
        toast.info(`Parte ${i + 1}/${totalChunks} enviada`);
      }

      toast.info('Arquivo(s) enviado(s)! Iniciando processamento...');

      const response = await fetch('/api/lead-capture/cnpj-autopilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          storagePaths,
          fileName: cnpjFile.name,
          targetLeads: 100,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao executar CNPJ autopilot');
      }

      toast.success('CNPJ Autopilot iniciado! Verifique os logs.');
      setCnpjFile(null);
      const fileInput = document.getElementById('cnpj-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar CNPJ autopilot');
    } finally {
      setCnpjLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Autopilot Section */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                Autopilot
              </CardTitle>
              <CardDescription className="text-slate-400">
                Busca e envia propostas automaticamente em todo o estado de São Paulo
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {autopilot?.is_active && (
                <Button
                  variant="outline"
                  onClick={runAutopilotNow}
                  disabled={autopilotLoading}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Executar Agora
                </Button>
              )}
              <Button
                onClick={toggleAutopilot}
                disabled={autopilotLoading}
                variant={autopilot?.is_active ? 'destructive' : 'default'}
              >
                {autopilotLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : autopilot?.is_active ? (
                  <ZapOff className="mr-2 h-4 w-4" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {autopilot?.is_active ? 'Parar' : 'Iniciar'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-slate-400">Status</p>
              <Badge className={autopilot?.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                {autopilot?.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-400">Mensagens/dia</p>
              <p className="text-white font-medium">{autopilot?.max_messages_per_day || 100}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Categorias</p>
              <p className="text-white font-medium">{autopilot?.categories?.length || 10}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Última execução</p>
              <p className="text-white font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {autopilot?.last_run_at
                  ? new Date(autopilot.last_run_at).toLocaleString('pt-BR')
                  : 'Nunca'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CNPJ Autopilot Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-400" />
                CNPJ Autopilot
              </CardTitle>
              <CardDescription className="text-slate-400">
                Importe leads da base de dados do governo e envie propostas
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="cnpj-file-input"
                type="file"
                accept=".jsonl,.json,.ndjson"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCnpjFile(file);
                    toast.success(`Arquivo selecionado: ${file.name}`);
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('cnpj-file-input')?.click()}
                disabled={cnpjLoading}
              >
                {cnpjFile ? cnpjFile.name : 'Selecionar arquivo'}
              </Button>
              <Button
                onClick={runCNPJAutopilot}
                disabled={cnpjLoading || !cnpjFile}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {cnpjLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Executar CNPJ
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-400">Formato</p>
              <p className="text-white font-medium">JSONL (1 lead/linha)</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Meta</p>
              <p className="text-white font-medium">100 leads/execução</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Fonte</p>
              <p className="text-white font-medium">Receita Federal</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Captação de Clientes</h1>
          <p className="text-slate-400">
            Busque empresas sem site e envie propostas via WhatsApp
          </p>
        </div>
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Campanha
              </Button>
            }
          />
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Nova Campanha de Captação</DialogTitle>
              <DialogDescription className="text-slate-400">
                Configure os parâmetros para buscar empresas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Nome da Campanha *</label>
                <Input
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="Ex: Restaurantes São Paulo"
                  className="mt-1 bg-slate-800 border-slate-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Localização *</label>
                <Input
                  value={newCampaign.location}
                  onChange={(e) => setNewCampaign({ ...newCampaign, location: e.target.value })}
                  placeholder="Ex: São Paulo, Brasil"
                  className="mt-1 bg-slate-800 border-slate-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Categoria *</label>
                <Select
                  value={newCampaign.category}
                  onValueChange={(value) => setNewCampaign({ ...newCampaign, category: value || '' })}
                >
                  <SelectTrigger className="mt-1 bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Raio de Busca (metros)</label>
                <Input
                  type="number"
                  value={newCampaign.radius_meters}
                  onChange={(e) =>
                    setNewCampaign({ ...newCampaign, radius_meters: Number(e.target.value) })
                  }
                  min={500}
                  max={50000}
                  className="mt-1 bg-slate-800 border-slate-700"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={createCampaign} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar e Iniciar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-slate-600 mb-4" />
            <p className="text-slate-400 text-center">
              Nenhuma campanha criada ainda.
              <br />
              Clique em &quot;Nova Campanha&quot; para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-300">Nome</TableHead>
                <TableHead className="text-slate-300">Localização</TableHead>
                <TableHead className="text-slate-300">Categoria</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300 text-right">Encontrados</TableHead>
                <TableHead className="text-slate-300 text-right">Sem Site</TableHead>
                <TableHead className="text-slate-300 text-right">Contactados</TableHead>
                <TableHead className="text-slate-300 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="border-slate-800">
                  <TableCell className="font-medium text-white">{campaign.name}</TableCell>
                  <TableCell className="text-slate-300">{campaign.location}</TableCell>
                  <TableCell className="text-slate-300">
                    {campaign.category.charAt(0).toUpperCase() + campaign.category.slice(1)}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[campaign.status]}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-slate-300">
                    {campaign.total_found}
                  </TableCell>
                  <TableCell className="text-right text-slate-300">
                    {campaign.total_without_website}
                  </TableCell>
                  <TableCell className="text-right text-slate-300">
                    {campaign.total_contacted}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/lead-capture/${campaign.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {campaign.status !== 'running' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => runCampaign(campaign.id)}
                          disabled={running === campaign.id}
                        >
                          {running === campaign.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCampaign(campaign.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
