/// Synapse.Production
/// Main InterSystems Interoperability Production for SynapseHealer.
/// Connects Ingestion Service -> Decision Business Process -> 3 Outbound Operations (Resubmit, Workflow, Quarantine).
Class Synapse.Production Extends Ens.Production [ ProcedureBlock ]
{

XData ProductionDefinition
{
<Production Name="Synapse.Production" LogGeneralTraceEvents="true">
  <Description>SynapseHealer: Autonomous Dead-Letter and Schema Healer Production</Description>
  <ActorPoolSize>2</ActorPoolSize>
  <Item Name="Synapse.Service.ChaosIngestService" Category="Ingest" ClassName="Synapse.Service.ChaosIngestService" PoolSize="1" Enabled="true" Foreground="false" InactivityTimeout="0">
    <Setting Target="Host" Name="TargetConfigNames">Synapse.Process.DeadLetterHealerBP</Setting>
  </Item>
  <Item Name="Synapse.Process.DeadLetterHealerBP" Category="Healer" ClassName="Synapse.Process.DeadLetterHealerBP" PoolSize="1" Enabled="true" Foreground="false">
    <Setting Target="Host" Name="AutoHealTarget">Synapse.Operation.ResubmitDeliveryOp</Setting>
    <Setting Target="Host" Name="WorkflowTarget">Synapse.Operation.WorkflowEscalationOp</Setting>
    <Setting Target="Host" Name="QuarantineTarget">Synapse.Operation.QuarantineVaultOp</Setting>
  </Item>
  <Item Name="Synapse.Operation.ResubmitDeliveryOp" Category="Delivery" ClassName="Synapse.Operation.ResubmitDeliveryOp" PoolSize="1" Enabled="true" Foreground="false">
  </Item>
  <Item Name="Synapse.Operation.WorkflowEscalationOp" Category="Workflow" ClassName="Synapse.Operation.WorkflowEscalationOp" PoolSize="1" Enabled="true" Foreground="false">
    <Setting Target="Host" Name="WorkflowRole">SynapseReviewers</Setting>
    <Setting Target="Host" Name="WorkflowOperation">EnsLib.Workflow.Operation</Setting>
  </Item>
  <Item Name="Synapse.Operation.QuarantineVaultOp" Category="Quarantine" ClassName="Synapse.Operation.QuarantineVaultOp" PoolSize="1" Enabled="true" Foreground="false">
  </Item>
  <Item Name="EnsLib.Workflow.Operation" Category="Workflow" ClassName="EnsLib.Workflow.Operation" PoolSize="1" Enabled="true" Foreground="false">
  </Item>
</Production>
}

}
