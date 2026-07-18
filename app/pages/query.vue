<template>
  <div>
    <h1>/query — lang: {{ $route.query.lang || '(none)' }} — isr: 60 + passQuery + allowQuery:[lang]</h1>
    <DebugInfo />
  </div>
</template>
