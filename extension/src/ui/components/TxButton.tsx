import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button, ButtonProps } from "@magnee/ui/components/button";

interface TxButtonProps {
    onClick: () => Promise<void | any>;
    text?: string;
    loadingText?: string;
    disabled?: boolean;
    size?: ButtonProps['size'];
    variant?: ButtonProps['variant'];
    className?: string;
    id?: string;
}

export default function TxButton({
    onClick,
    text = "Submit",
    loadingText = "Processing...",
    disabled = false,
    size = "default",
    variant = "outline",
    className,
    id
}: TxButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const handleClick = async () => {
        if (isLoading) return;
        setIsLoading(true);
        setError(null);

        try {
            await onClick();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err : new Error('Transaction failed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            variant={variant}
            size={size}
            className={className}
            onClick={handleClick}
            disabled={disabled || isLoading}
        >
            {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? loadingText : (error ? 'Retry' : text)}
        </Button>
    );
}