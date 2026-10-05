import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, X, Loader2, Zap, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'
import { supabase } from '@/integrations/supabase/client'

interface CallWebhookActionConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: Record<string, string>
  body: string
  max_retries: number
  retry_delay_seconds: number
  continue_on_failure: boolean
}

interface CallWebhookActionProps {
  config: any
  onChange: (config: any) => void
}

const DEFAULT_CONFIG: CallWebhookActionConfig = {
  url: '',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '',
  max_retries: 3,
  retry_delay_seconds: 5,
  continue_on_failure: true
}

export const CallWebhookAction = ({ config, onChange }: CallWebhookActionProps) => {
  const [localConfig, setLocalConfig] = useState<CallWebhookActionConfig>(
    config || DEFAULT_CONFIG
  )
  const [testResult, setTestResult] = useState<any>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [jsonError, setJsonError] = useState<string>('')
  const { toast } = useToast()

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  const addHeader = () => {
    const newHeaders = { ...localConfig.headers, '': '' }
    handleChange('headers', newHeaders)
  }

  const updateHeader = (oldKey: string, newKey: string, value: string) => {
    const newHeaders = { ...localConfig.headers }
    if (oldKey !== newKey) {
      delete newHeaders[oldKey]
    }
    newHeaders[newKey] = value
    handleChange('headers', newHeaders)
  }

  const removeHeader = (key: string) => {
    const newHeaders = { ...localConfig.headers }
    delete newHeaders[key]
    handleChange('headers', newHeaders)
  }

  const formatJSON = () => {
    try {
      const parsed = JSON.parse(localConfig.body)
      handleChange('body', JSON.stringify(parsed, null, 2))
      setJsonError('')
    } catch (error) {
      setJsonError('Invalid JSON format')
    }
  }

  const validateJSON = () => {
    try {
      JSON.parse(localConfig.body)
      setJsonError('')
      toast({ title: 'Valid JSON' })
    } catch (error) {
      setJsonError('Invalid JSON format')
    }
  }

  const handleTestWebhook = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: {
          url: localConfig.url,
          method: localConfig.method,
          headers: localConfig.headers,
          body: localConfig.body,
        },
      })
      if (error) throw error
      setTestResult(data)
      if (data?.ok) {
        toast({ title: `Webhook OK (${data.status})` })
      } else {
        toast({
          title: 'Webhook test thất bại',
          description: data?.error ?? `HTTP ${data?.status ?? '?'}`,
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Webhook test thất bại',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
      setTestResult({ ok: false, error: error.message })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* URL */}
      <div>
        <Label>Webhook URL *</Label>
        <Input
          type="url"
          value={localConfig.url}
          onChange={(e) => handleChange('url', e.target.value)}
          placeholder="https://api.example.com/webhook"
        />
      </div>
      
      {/* Method */}
      <div>
        <Label>Method *</Label>
        <RadioGroup
          value={localConfig.method}
          onValueChange={(value) => handleChange('method', value)}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="POST" id="method-post" />
            <Label htmlFor="method-post" className="font-normal">POST</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="PUT" id="method-put" />
            <Label htmlFor="method-put" className="font-normal">PUT</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="PATCH" id="method-patch" />
            <Label htmlFor="method-patch" className="font-normal">PATCH</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="DELETE" id="method-delete" />
            <Label htmlFor="method-delete" className="font-normal">DELETE</Label>
          </div>
        </RadioGroup>
      </div>
      
      {/* Headers */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Headers (optional)</Label>
          <Button variant="outline" size="sm" onClick={addHeader}>
            <Plus className="w-4 h-4 mr-1" />
            Add Header
          </Button>
        </div>
        
        <div className="space-y-2">
          {Object.entries(localConfig.headers || {}).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <Input
                value={key}
                onChange={(e) => updateHeader(key, e.target.value, value)}
                placeholder="Header name"
                className="flex-1"
              />
              <Input
                value={value}
                onChange={(e) => updateHeader(key, key, e.target.value)}
                placeholder="Header value"
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeHeader(key)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Payload */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Payload (JSON)</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={formatJSON}>
              Format
            </Button>
            <Button variant="outline" size="sm" onClick={validateJSON}>
              Validate
            </Button>
          </div>
        </div>
        
        <Textarea
          value={localConfig.body}
          onChange={(e) => handleChange('body', e.target.value)}
          rows={10}
          className="font-mono text-sm"
          placeholder={`{
  "event": "low_stock",
  "item": {
    "code": "{{item_code}}",
    "name": "{{item_name}}",
    "quantity": {{current_qty}}
  }
}`}
        />
        
        {jsonError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{jsonError}</AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Retry Options */}
      <div className="space-y-2">
        <Label>Retry Options</Label>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <Label className="text-sm text-muted-foreground">Max retries</Label>
            <Select
              value={localConfig.max_retries.toString()}
              onValueChange={(value) => handleChange('max_retries', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 5, 10].map(n => (
                  <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <Label className="text-sm text-muted-foreground">Retry delay</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={300}
                value={localConfig.retry_delay_seconds}
                onChange={(e) => handleChange('retry_delay_seconds', parseInt(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="continue-on-fail"
            checked={localConfig.continue_on_failure}
            onCheckedChange={(checked) => handleChange('continue_on_failure', checked)}
          />
          <Label htmlFor="continue-on-fail" className="font-normal">
            Continue workflow if webhook fails
          </Label>
        </div>
      </div>
      
      {/* Test Button */}
      <div>
        <Button
          variant="outline"
          onClick={handleTestWebhook}
          disabled={isTesting || !localConfig.url}
        >
          {isTesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Test Webhook
            </>
          )}
        </Button>
        
        {testResult && (
          <Card className="mt-4 p-4">
            <div className="text-sm font-medium mb-2">Test Result:</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  )
}
