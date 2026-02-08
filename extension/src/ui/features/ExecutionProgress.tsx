/**
 * ExecutionProgress Component
 * 
 * Shows real-time step-by-step status during Li.Fi route execution.
 * Now uses Tailwind + design tokens instead of inline CSS strings.
 */
import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface ExecutionStatus {
    step: number;
    total: number;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
    message: string;
    substatus?: string;
}

interface Props {
    status: ExecutionStatus;
}

export function ExecutionProgress({ status }: Props) {
    const progressPercent = status.total > 0 
        ? Math.round((status.step / status.total) * 100) 
        : 0;

    return (
        <div className="glass-card rounded-2xl p-4 w-full space-y-3">
            {/* Step counter */}
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Step {status.step} of {status.total}</span>
                <span className="text-primary font-semibold">{progressPercent}%</span>
            </div>
            
            {/* Progress bar */}
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                    className="h-full bg-linear-to-r from-primary to-blue-400 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }} 
                />
            </div>

            {/* Status message */}
            <div className="flex items-center gap-2 text-sm">
                {status.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                {status.status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {status.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {status.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                <span className="text-foreground">{status.message || 'Waiting...'}</span>
            </div>

            {status.substatus && (
                <div className="text-xs text-muted-foreground pl-6">{status.substatus}</div>
            )}

            {status.status === 'done' && (
                <div className="mt-2 p-2 badge-success rounded-xl border text-sm text-center">
                    Transaction complete! Funds delivered.
                </div>
            )}

            {status.status === 'failed' && (
                <div className="mt-2 p-2 badge-error rounded-xl border text-sm text-center">
                    Transaction failed. Please try again.
                </div>
            )}
        </div>
    );
}
