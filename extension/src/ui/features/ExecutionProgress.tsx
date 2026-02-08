/**
 * ExecutionProgress Component
 * 
 * Shows real-time step-by-step status during Li.Fi route execution.
 * Displays a scrolling log of events with status-driven header.
 */
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

export interface TxLink {
    label: string;
    url: string;
}

export interface ExecutionStatus {
    step: number;
    total: number;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
    message: string;
    substatus?: string;
    history: string[];
    txLinks: TxLink[];
}

interface Props {
    status: ExecutionStatus;
}

export function ExecutionProgress({ status }: Props) {
    const statusLabel = status.status === 'done' ? 'Complete!'
        : status.status === 'failed' ? 'Failed'
        : status.history.length > 0 ? `Executing... (${status.history.length} steps)`
        : 'Preparing...';

    const StatusIcon = status.status === 'done' ? CheckCircle2
        : status.status === 'failed' ? XCircle
        : Loader2;

    return (
        <div className="glass-card rounded-2xl p-4 w-full space-y-3">
            {/* Status header */}
            <div className="flex items-center gap-2 text-sm">
                <StatusIcon className={`h-4 w-4 ${
                    status.status === 'done' ? 'text-green-400' :
                    status.status === 'failed' ? 'text-red-400' :
                    'animate-spin text-primary'
                }`} />
                <span className="font-medium text-foreground">{statusLabel}</span>
            </div>

            {/* Animated progress indicator */}
            {status.status === 'in_progress' && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-linear-to-r from-primary to-blue-400 rounded-full animate-pulse" 
                         style={{ width: '60%' }} />
                </div>
            )}
            {status.status === 'done' && (
                <div className="h-1 bg-green-500/30 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: '100%' }} />
                </div>
            )}

            {/* Status History Stack */}
            <div className="flex flex-col gap-1.5 pr-1 text-sm bg-secondary/20 rounded-lg p-2">
                {status.history.length === 0 && (
                    <span className="text-muted-foreground italic text-xs">Waiting for execution...</span>
                )}
                {status.history.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <div className="mt-0.5 shrink-0">
                            {i === status.history.length - 1 && status.status === 'in_progress' ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            ) : status.status === 'failed' && i === status.history.length - 1 ? (
                                <XCircle className="h-3 w-3 text-red-400" />
                            ) : (
                                <CheckCircle2 className="h-3 w-3 text-green-500/60" />
                            )}
                        </div>
                        <span className={`${i === status.history.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {log}
                        </span>
                    </div>
                ))}
            </div>

            {status.status === 'done' && (
                <div className="space-y-2 animate-in zoom-in-95">
                    <div className="p-2 badge-success rounded-xl border text-sm text-center">
                        Transaction complete! Funds delivered.
                    </div>
                    {status.txLinks.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            {status.txLinks.map((link, i) => (
                                <a 
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 hover:underline transition-colors px-2 py-1 rounded-lg bg-secondary/30 hover:bg-secondary/50"
                                >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span>{link.label}</span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {status.status === 'failed' && (
                <div className="p-2 badge-error rounded-xl border text-sm text-center animate-in zoom-in-95">
                    Transaction failed. Please try again.
                </div>
            )}
        </div>
    );
}
