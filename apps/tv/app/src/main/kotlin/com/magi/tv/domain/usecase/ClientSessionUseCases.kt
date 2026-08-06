package com.magi.tv.domain.usecase

import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.PollResult

class BeginClientAuthorizationUseCase(private val repository: ClientSessionRepository) {
    suspend operator fun invoke(): DeviceAuthorizationChallenge = repository.beginAuthorization()
}

class PollClientAuthorizationUseCase(private val repository: ClientSessionRepository) {
    suspend operator fun invoke(challenge: DeviceAuthorizationChallenge): PollResult = repository.pollAuthorization(challenge)
}

class SendClientHeartbeatUseCase(private val repository: ClientSessionRepository) {
    suspend operator fun invoke() = repository.heartbeat()
}
