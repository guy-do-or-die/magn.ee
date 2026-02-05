/**
 * ExecutionProgress Component
 * 
 * Shows real-time step-by-step status during Li.Fi route execution.
 */

import React from 'react';

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
        <div className="execution-progress">
            <div className="step-indicator">
                <span className="step-number">Step {status.step} of {status.total}</span>
                <span className="step-percent">{progressPercent}%</span>
            </div>
            
            <div className="progress-bar">
                <div 
                    className="progress-fill"
                    style={{ width: `${progressPercent}%` }} 
                />
            </div>

            <div className="status-message">
                {status.status === 'pending' && (
                    <span className="status-icon pending">⏳</span>
                )}
                {status.status === 'in_progress' && (
                    <span className="status-icon in-progress">🔄</span>
                )}
                {status.status === 'done' && (
                    <span className="status-icon done">✅</span>
                )}
                {status.status === 'failed' && (
                    <span className="status-icon failed">❌</span>
                )}
                <span className="message-text">{status.message || 'Waiting...'}</span>
            </div>

            {status.substatus && (
                <div className="substatus">{status.substatus}</div>
            )}

            {status.status === 'done' && (
                <div className="complete-message">
                    Transaction complete! Funds delivered.
                </div>
            )}

            {status.status === 'failed' && (
                <div className="error-message">
                    Transaction failed. Please try again.
                </div>
            )}
        </div>
    );
}

// CSS styles (to be added to popup.css or inline)
export const executionProgressStyles = `
.execution-progress {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px;
    margin: 16px 0;
}

.step-indicator {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 14px;
}

.step-number {
    color: #a0aec0;
}

.step-percent {
    color: #667eea;
    font-weight: 600;
}

.progress-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 12px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea, #764ba2);
    border-radius: 4px;
    transition: width 0.3s ease;
}

.status-message {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.status-icon {
    font-size: 16px;
}

.status-icon.in-progress {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.message-text {
    color: #e2e8f0;
}

.substatus {
    font-size: 12px;
    color: #718096;
    margin-top: 4px;
    padding-left: 24px;
}

.complete-message {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(72, 187, 120, 0.2);
    border-radius: 8px;
    color: #48bb78;
    font-size: 14px;
    text-align: center;
}

.error-message {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(245, 101, 101, 0.2);
    border-radius: 8px;
    color: #f56565;
    font-size: 14px;
    text-align: center;
}
`;
