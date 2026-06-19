'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CustomFieldsPanel } from '@/components/contacts/custom-fields-manager';

export function CustomFieldsSettings() {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Campos personalizados</h2>
        <p className="text-sm text-slate-400">
          Defina campos de contato extras (ex. CEP, origem do lead). Eles aparecem
          em cada contato e na ação de automação "Atualizar Campo de Contato".
        </p>
      </div>

      <Card className="border-slate-700 bg-slate-900 ring-0 ring-transparent">
        <CardContent className="pt-4">
          <CustomFieldsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
