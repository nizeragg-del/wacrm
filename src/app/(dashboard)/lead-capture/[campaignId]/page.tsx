'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, Play, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadCampaign, CapturedLead } from '@/lib/lead-capture/types';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  running: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-500/20 text-slate-400',
  contacted: 'bg-green-500/20 text-green-400',
  responded: 'bg-blue-500/20 text-blue-400',
  converted: 'bg-purple-500/20 text-purple-400',
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.campaignId as string;

  const [campaign, setCampaign] = useState<LeadCampaign | null>(null);
  const [leads, setLeads] = useState<CapturedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    async function loadCampaign() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          toast.error('Não autenticado');
          return;
        }

        const response = await fetch(`/api/lead-capture/${campaignId}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) throw new Error('Falha ao carregar campanha');

        const data = await response.json();
        setCampaign(data.campaign);
        setLeads(data.leads || []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao carregar campanha');
      } finally {
        setLoading(false);
      }
    }

    loadCampaign();
  }, [campaignId]);

  async function fetchCampaignDetails() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Não autenticado');
        return;
      }

      const response = await fetch(`/api/lead-capture/${campaignId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Falha ao carregar campanha');

      const data = await response.json();
      setCampaign(data.campaign);
      setLeads(data.leads || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar campanha');
    } finally {
      setLoading(false);
    }
  }

  async function runCampaign() {
    setRunning(true);
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
      fetchCampaignDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar campanha');
    } finally {
      setRunning(false);
    }
  }

  async function deleteCampaign() {
    if (!confirm('Tem certeza que deseja deletar esta campanha?')) return;

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
      router.push('/lead-capture');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao deletar campanha');
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/lead-capture')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="text-center py-12 text-slate-400">
          Campanha não encontrada.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/lead-capture')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <p className="text-slate-400">
              {campaign.location} • {campaign.category}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status !== 'running' && (
            <Button onClick={runCampaign} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Executar
                </>
              )}
            </Button>
          )}
          <Button variant="destructive" onClick={deleteCampaign}>
            <Trash2 className="mr-2 h-4 w-4" />
            Deletar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Status</CardDescription>
            <CardTitle>
              <Badge className={STATUS_COLORS[campaign.status]}>
                {campaign.status}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Encontrados</CardDescription>
            <CardTitle className="text-2xl text-white">
              {campaign.total_found}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Sem Site</CardDescription>
            <CardTitle className="text-2xl text-yellow-400">
              {campaign.total_without_website}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Contactados</CardDescription>
            <CardTitle className="text-2xl text-green-400">
              {campaign.total_contacted}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Leads ({leads.length})
          </h2>
        </div>
        {leads.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Nenhum lead encontrado ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-300">Empresa</TableHead>
                <TableHead className="text-slate-300">Endereço</TableHead>
                <TableHead className="text-slate-300">Telefone</TableHead>
                <TableHead className="text-slate-300">Email</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="border-slate-800">
                  <TableCell className="font-medium text-white">
                    {lead.business_name}
                  </TableCell>
                  <TableCell className="text-slate-300 text-sm max-w-[200px] truncate">
                    {lead.address || '-'}
                  </TableCell>
                  <TableCell className="text-slate-300 text-sm">
                    {lead.phone || '-'}
                  </TableCell>
                  <TableCell className="text-slate-300 text-sm">
                    {lead.email || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={LEAD_STATUS_COLORS[lead.status]}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
