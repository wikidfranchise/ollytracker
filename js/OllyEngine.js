// This is the master engine for the entire OllyTracker site.
// It will contain all shared logic for API calls, utilities, and portfolio management.

window.OllyEngine = {

    Utils: {
        // Functions from OllyStream.html
        formatTime: function(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) return 'Just now';
            else if (diffMins < 60) return `${diffMins}m ago`;
            else return date.toLocaleTimeString();
        },
        
        truncateCompanyName: function(name) {
            return name && name.length > 32 ? name.substring(0, 32) + '...' : (name || 'Unknown Company');
        },

        // Functions from ollyinsider-enhanced02.html
        extractCIKs: function(filing) {
            const ciks = {
                reportingPerson: null,
                issuer: null
            };
            
            if (filing.reportingOwner && filing.issuer) {
                ciks.reportingPerson = {
                    cik: filing.reportingOwner.cik,
                    name: filing.reportingOwner.name
                };
                ciks.issuer = {
                    cik: filing.issuer.cik,
                    name: filing.issuer.name,
                    ticker: filing.issuer.tradingSymbol || null
                };
                return ciks;
            }
            
            if (filing.issuerInfo) {
                ciks.reportingPerson = {
                    cik: filing.entities?.find(e => e.companyName?.includes('(Reporting)'))?.cik || '',
                    name: filing.issuerInfo.nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold || 'Unknown'
                };
                ciks.issuer = {
                    cik: filing.issuerInfo.issuerCik || filing.entities?.[0]?.cik || '',
                    name: filing.issuerInfo.issuerName || filing.entities?.[0]?.companyName || 'Unknown',
                    ticker: filing.issuerInfo.issuerTicker || filing.entities?.[0]?.ticker || null
                };
                return ciks;
            }
            
            if (filing.entities && filing.entities.length > 0) {
                filing.entities.forEach(entity => {
                    const entityName = entity.companyName || '';
                    
                    if (entityName.includes('(Reporting)')) {
                        ciks.reportingPerson = {
                            cik: entity.cik || filing.cik,
                            name: entityName.replace('(Reporting)', '').trim()
                        };
                    } else if (entityName.includes('(Issuer)') || entityName.includes('(Subject)')) {
                        ciks.issuer = {
                            cik: entity.cik || filing.cik,
                            name: entityName.replace('(Issuer)', '').replace('(Subject)', '').trim(),
                            ticker: entity.ticker || filing.ticker || null
                        };
                    }
                });
            }
            
            if (!ciks.issuer && filing.cik) {
                ciks.issuer = {
                    cik: filing.cik,
                    name: filing.companyName || filing.companyNameLong || 'Unknown',
                    ticker: filing.ticker || null
                };
            }
            
            return ciks;
        },

        getFormDescription: function(formType) {
            const descriptions = {
                '3': 'Initial Ownership',
                '4': 'Change in Ownership',
                '5': 'Annual Statement',
                '144': 'Notice of Sale'
            };
            return descriptions[formType] || 'Other';
        }
    },

    API: {
        // We will add functions to call our secure Vercel endpoints here.
    },

    Portfolio: {
        // We will add the unified Portfolio/Watchlist logic here.
    },

    UI: {
        // We will add functions that create UI elements like cards and modals here.
    }

};