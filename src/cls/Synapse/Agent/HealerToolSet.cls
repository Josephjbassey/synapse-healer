/// Synapse.Agent.HealerToolSet
/// InterSystems AI Hub ToolSet packaging governed healing tools for agent consumption.
Class Synapse.Agent.HealerToolSet Extends %AI.ToolSet [ DependsOn = Synapse.Agent.HealerTools, ProcedureBlock ]
{

XData Definition [ MimeType = "application/xml" ]
{
<ToolSet Name="HealerToolSet">
    <Description>Governed tools for semantic schema lookup, payload syntax verification, and risk scoring in SynapseHealer</Description>
    <Include Class="Synapse.Agent.HealerTools" />
</ToolSet>
}

}
