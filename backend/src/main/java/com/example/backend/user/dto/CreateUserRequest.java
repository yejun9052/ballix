package com.example.backend.user.dto;

public record CreateUserRequest(
        String name,
        String email
) {}
