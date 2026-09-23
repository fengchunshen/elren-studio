import React from 'react';
import { GenerationChoice } from './generation-controls';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function ModelParameterFields({ fields = [], values = {}, onChange, immersive = false }) {
    return fields.map(field => {
        const label = field.label || field.name, value = values[field.name] ?? field.defaultValue ?? '';
        const change = value => onChange({ ...values, [field.name]: value });
        if (field.type === 'boolean' || typeof field.defaultValue === 'boolean') return <Label key={field.name} className="flex items-center gap-2 text-xs"><Checkbox aria-label={label} checked={value === true || value === 'true'} onCheckedChange={change} />{label}</Label>;
        return <Label key={field.name} className="block space-y-1 text-xs"><span>{label}</span>
            {field.values?.length ? immersive ? <GenerationChoice label={label} value={value || field.values[0]} options={field.values.map(value => ({ value: String(value), label: String(value) }))} onChange={change} /> : <NativeSelect aria-label={label} value={value || field.values[0]} onChange={event => change(event.target.value)}>{field.values.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</NativeSelect>
                : field.multiline ? <Textarea aria-label={label} value={value} onChange={event => change(event.target.value)} className="min-h-20" />
                    : <Input aria-label={label} type={['number', 'integer'].includes(field.type) ? 'number' : 'text'} min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} value={value} required={field.required} onChange={event => change(event.target.value)} />}
        </Label>;
    });
}
