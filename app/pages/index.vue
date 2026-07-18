<template>
  <div>
    <h1>index — isr: true behind site-wide basic auth (P3 demo)</h1>
    <p>
      If you can read this without credentials, an authenticated visitor
      populated the shared ISR cache — basic auth is now bypassed for
      everyone. If you get an error instead, no authenticated visitor has
      populated this entry since the last purge/deploy — and unauthenticated
      requests never can (401 is not a cacheable ISR outcome). See README.
    </p>
    <DebugInfo />
  </div>
</template>
