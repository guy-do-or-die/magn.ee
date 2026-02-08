import { Button } from '@magnee/ui/components/button';
import { Route } from '@/injected/magneeUtils';
import { ChevronRight } from 'lucide-react';

interface QuoteListProps {
    routes: Route[];
    onSelectRoute: (route: Route) => void;
    onBack: () => void;
}

export function QuoteList({ routes, onSelectRoute, onBack }: QuoteListProps) {
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Available Routes</h3>
            {routes.map(r => (
                <div
                    key={r.id}
                    className="glass-card rounded-xl p-3 cursor-pointer hover:border-primary/40 transition-all text-left"
                    onClick={() => onSelectRoute(r)}
                >
                    <div className="flex justify-between items-center">
                        <div className="font-semibold text-sm">{r.title}</div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        via {r.strategy === 'EXECUTE_ROUTE' ? 'Magnee Router' : 'Li.Fi Bridge'}
                    </div>
                </div>
            ))}
            <Button variant="ghost" className="w-full text-xs" onClick={onBack}>
                Back to Config
            </Button>
        </div>
    );
}
