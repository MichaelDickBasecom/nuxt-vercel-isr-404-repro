<template>
  <div>
    <h1>/catchall/{{ [$route.params.slug].flat().join('/') }} — isr: 60 catch-all (special: 120 override)</h1>
    <DebugInfo />
  </div>
</template>
