import { Logo } from '@magnee/ui/assets/logo';

interface HeaderProps {
    title?: string;
    subtitle?: string;
}

export function Header({ title = 'magnee', subtitle = 'Cross-Chain Payment Interceptor' }: HeaderProps) {
    return (
        <header className="text-center mb-4 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
                <Logo size={24} />
                <h1 className="text-lg font-bold text-foreground">
                    {title}
                </h1>
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
        </header>
    );
}
