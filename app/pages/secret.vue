<template>
  <div>
    <h1>/secret — isr: true behind basic auth (cause P3)</h1>
    <p>
      If you can read this without credentials, an authenticated visitor
      populated the shared ISR cache — basic auth is now bypassed for
      everyone (docs/p3-auth.md).
    </p>
    <DebugInfo />
  </div>
</template>
