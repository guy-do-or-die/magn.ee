function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

document.addEventListener('DOMContentLoaded', () => {
    const reqId = getQueryParam('id');

    if (!reqId) {
        document.body.innerHTML = '<p style="color:red;text-align:center">Error: No Request ID</p>';
        return;
    }

    // Fetch secure details from background
    chrome.runtime.sendMessage({ type: 'GET_TX_DETAILS', id: reqId }, (response) => {
        if (!response || response.error) {
            document.body.innerHTML = '<p style="color:red;text-align:center">Error: Request not found</p>';
            return;
        }

        const { to, value } = response;

        document.getElementById('to').textContent = to;

        // Simple wei to ETH format for display
        try {
            const wei = BigInt(value);
            const eth = Number(wei) / 1e18;
            document.getElementById('value').textContent = `${eth} ETH`;
        } catch (e) {
            document.getElementById('value').textContent = value;
        }
    });

    const sendDecision = (action) => {
        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: {
                id: reqId,
                action: action
            }
        });
        window.close();
    };

    document.getElementById('magneefyBtn').addEventListener('click', () => {
        sendDecision('MAGNEEFY');
    });

    document.getElementById('originalBtn').addEventListener('click', () => {
        sendDecision('CONTINUE');
    });

    document.getElementById('rejectBtn').addEventListener('click', () => {
        sendDecision('REJECT');
    });
});
