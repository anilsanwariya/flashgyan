import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file) {
      throw new Error('No PDF file uploaded')
    }

    const llamaApiKey = Deno.env.get('LLAMA_CLOUD_API_KEY')

    // 1. Send the file to LlamaParse
    const parseData = new FormData()
    parseData.append('file', file)
    // This tells LlamaParse to treat it like a complex document and extract images
    parseData.append('premium_mode', 'true') 

    const uploadResponse = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llamaApiKey}`,
      },
      body: parseData,
    })

    const uploadResult = await uploadResponse.json()
    const jobId = uploadResult.id

    // 2. Poll for the result (LlamaParse takes a few seconds to process)
    let markdown = ""
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      
      const statusResponse = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
        headers: { 'Authorization': `Bearer ${llamaApiKey}` }
      })

      if (statusResponse.ok) {
        const result = await statusResponse.json()
        markdown = result.markdown
        break
      } else if (statusResponse.status !== 404) {
        // 404 just means it's still processing. Anything else is a real error.
        throw new Error("Failed to get parsed markdown")
      }
    }

    return new Response(
      JSON.stringify({ markdown }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})