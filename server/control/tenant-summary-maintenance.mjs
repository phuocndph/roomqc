import {tenantSummaryBinding} from './tenant-summary.mjs';
import {releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';

// Publisher identity extends the exact runtime transport binding with a
// separately approved release. This helper does not approve a release itself.
export function summaryMaintenanceBinding(cluster,expected){
 const release=releaseExpectation(expected);
 if(release.clusterId!==cluster?.id)throw Object.assign(new Error('SUMMARY_PUBLICATION_TARGET_INVALID'),{code:'SUMMARY_PUBLICATION_TARGET_INVALID'});
 return Object.freeze({...tenantSummaryBinding({...cluster,ref:cluster.credentialRef}),
  releaseFingerprint:releaseExpectationFingerprint(release)});
}
