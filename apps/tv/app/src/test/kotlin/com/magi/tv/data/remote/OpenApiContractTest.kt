package com.magi.tv.data.remote

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Cross-language contract test (constitution II/V): verifies that the Kotlin
 * wire DTOs match the Magi open API contract.
 *
 * The single source of truth is `packages/types/src/vo` (the TypeScript VOs that
 * generate /api/open.json). Each [expected] block below snapshots that
 * contract's field names + nullability. When the server contract changes, this
 * test MUST be updated in lockstep — exactly the drift this guard prevents (a TS
 * contract change with no Kotlin DTO change fails the build).
 *
 * Uses kotlinx-serialization descriptors (no kotlin-reflect dependency).
 */
class OpenApiContractTest {

    @Test
    fun `ChannelDto matches OpenChannelVo contract`() {
        expected("OpenChannelVo", serializer<ChannelDto>()) {
            field("id", required = true)
            field("name", required = true)
            field("group", required = false)
            field("logo", required = false)
            field("channelNumber", required = false)
        }
    }

    @Test
    fun `ProgrammeDto matches OpenProgrammeVo contract`() {
        expected("OpenProgrammeVo", serializer<ProgrammeDto>()) {
            field("channelId", required = true)
            field("title", required = false)
            field("subTitle", required = false)
            field("startAt", required = true)
            field("stopAt", required = true)
            field("category", required = false)
        }
    }

    @Test
    fun `PlaybackDecisionDto matches OpenPlaybackVo contract`() {
        expected("OpenPlaybackVo", serializer<PlaybackDecisionDto>()) {
            field("channelId", required = true)
            field("playable", required = true)
            field("primary", required = false)
            field("fallbacks", required = true)
            field("decisionExpiresAt", required = true)
            field("deliveryMode", required = true)
        }
    }

    @Test
    fun `PlaybackLineDto matches OpenPlaybackLineVo contract`() {
        expected("OpenPlaybackLineVo", serializer<PlaybackLineDto>()) {
            field("streamId", required = true)
            field("url", required = true)
            field("format", required = false)
            field("health", required = true)
        }
    }

    @Test
    fun `ChannelGroupDto matches OpenGroupVo contract`() {
        expected("OpenGroupVo", serializer<ChannelGroupDto>()) {
            field("name", required = false)
            field("count", required = true)
        }
    }

    /**
     * Asserts the serializer's fields exactly match the contract: same names,
     * same order-agnostic set, required fields non-nullable, and no stray fields.
     */
    private fun expected(
        contractName: String,
        serializer: KSerializer<*>,
        block: ContractBuilder.() -> Unit,
    ) {
        val builder = ContractBuilder()
        builder.block()
        val expected = builder.fields
        val descriptor = serializer.descriptor
        val elementCount = descriptor.elementsCount
        val actualNames = (0 until elementCount).map { descriptor.getElementName(it) }
        val actualNullable = (0 until elementCount).associate { index ->
            descriptor.getElementName(index) to descriptor.getElementDescriptor(index).isNullable
        }

        val missing = expected.keys - actualNames.toSet()
        assertTrue(missing.isEmpty(), "$contractName: DTO missing contract fields: $missing")

        val stray = actualNames.toSet() - expected.keys
        assertTrue(stray.isEmpty(), "$contractName: DTO has fields not in contract: $stray")

        for ((name, spec) in expected) {
            val nullable = actualNullable[name] ?: fail("$contractName: '$name' missing")
            if (spec.required && nullable) {
                fail("$contractName: '$name' is required (non-nullable) in contract but nullable in DTO")
            }
        }

        assertEquals(expected.size, actualNames.size, "$contractName: field count mismatch")
    }

    private data class FieldSpec(val required: Boolean)

    private class ContractBuilder {
        val fields = mutableMapOf<String, FieldSpec>()
        fun field(name: String, required: Boolean) {
            fields[name] = FieldSpec(required)
        }
    }
}
